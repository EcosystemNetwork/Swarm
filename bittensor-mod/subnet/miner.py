"""
SwarmCare Miner

GPU worker that trains care coordination models on distributed compute.
Receives training tasks from validators, fine-tunes models, returns predictions.
"""

import os
import time
import hashlib
import json
from typing import List, Dict, Any, Tuple
import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling
)
from datasets import Dataset
from protocol import (
    TrainingTask,
    TrainingResult,
    CareScenario,
    CoordinationPlan,
)


class SwarmCareMiner:
    """Miner that trains care coordination models"""

    def __init__(self, miner_uid: int, model_cache_dir: str = "./model_cache"):
        self.miner_uid = miner_uid
        self.model_cache_dir = model_cache_dir
        os.makedirs(model_cache_dir, exist_ok=True)

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.gpu_info = self._get_gpu_info()

    def _get_gpu_info(self) -> Dict[str, str]:
        """Get GPU information"""
        if torch.cuda.is_available():
            return {
                "device": torch.cuda.get_device_name(0),
                "memory_total": f"{torch.cuda.get_device_properties(0).total_memory / 1e9:.2f}GB",
                "cuda_version": torch.version.cuda or "unknown",
            }
        return {"device": "CPU", "memory_total": "N/A", "cuda_version": "N/A"}

    def scenario_to_prompt(self, scenario: CareScenario) -> str:
        """Convert care scenario to training prompt"""
        residents_desc = "\n".join([
            f"- {r.name} (Room {r.room}, Floor {r.floor}, {r.mobility}, Priority {r.priority})"
            for r in scenario.residents
        ])

        robots_desc = "\n".join([
            f"- {rob.id} ({rob.type}, Location: {rob.current_location}, "
            f"Battery: {rob.battery_level*100:.0f}%, Capacity: {rob.capacity})"
            for rob in scenario.robots
        ])

        constraints_desc = "\n".join([f"- {k}: {v}" for k, v in scenario.constraints.items()])

        prompt = f"""# Care Coordination Task: {scenario.type.value}
Difficulty: {scenario.difficulty.value}

## Residents
{residents_desc}

## Available Robots
{robots_desc}

## Constraints
{constraints_desc}

## Task
Create an optimal coordination plan that:
1. Assigns robots to residents
2. Schedules actions efficiently
3. Meets all constraints
4. Minimizes total time
5. Includes fallback options

## Coordination Plan (JSON format):
"""
        return prompt

    def create_training_dataset(self, scenarios: List[CareScenario]) -> Dataset:
        """Create HuggingFace dataset from training scenarios"""
        examples = []

        for scenario in scenarios:
            prompt = self.scenario_to_prompt(scenario)

            # If we have optimal plan, use it as target
            if scenario.optimal_plan:
                completion = json.dumps(scenario.optimal_plan, indent=2)
            else:
                # Fallback: generate reasonable plan structure
                completion = self._generate_baseline_plan(scenario)

            examples.append({
                "text": prompt + completion,
                "scenario_id": scenario.id,
            })

        return Dataset.from_dict({
            "text": [ex["text"] for ex in examples],
            "scenario_id": [ex["scenario_id"] for ex in examples],
        })

    def _generate_baseline_plan(self, scenario: CareScenario) -> str:
        """Generate baseline coordination plan"""
        # Simple round-robin assignment
        assignments = {}
        schedule = []

        available_robots = [r for r in scenario.robots if r.status == "available"]
        if not available_robots:
            available_robots = scenario.robots[:1]  # Use first robot as fallback

        robot_idx = 0
        for resident in scenario.residents:
            robot = available_robots[robot_idx % len(available_robots)]
            if robot.id not in assignments:
                assignments[robot.id] = []
            assignments[robot.id].append(resident.id)

            schedule.append({
                "time": len(schedule) * 5,  # 5 min intervals
                "robot": robot.id,
                "action": f"visit_{resident.id}",
                "location": resident.room,
            })
            robot_idx += 1

        plan = {
            "robot_assignments": assignments,
            "schedule": schedule,
            "total_time": len(schedule) * 5,
            "coverage": 1.0,
        }

        return json.dumps(plan, indent=2)

    def train_model(self, task: TrainingTask) -> Tuple[Any, float, float]:
        """Fine-tune model on training scenarios"""
        start_time = time.time()

        # Load base model
        model_name = task.model_config.get("base_model", "meta-llama/Llama-3.2-1B")
        print(f"Loading base model: {model_name}")

        tokenizer = AutoTokenizer.from_pretrained(model_name, cache_dir=self.model_cache_dir)
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            cache_dir=self.model_cache_dir,
            torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            device_map="auto" if self.device == "cuda" else None,
        )

        # Prepare dataset
        train_dataset = self.create_training_dataset(task.training_scenarios)

        def tokenize_function(examples):
            return tokenizer(
                examples["text"],
                truncation=True,
                max_length=task.model_config.get("max_length", 2048),
            )

        tokenized_dataset = train_dataset.map(tokenize_function, batched=True, remove_columns=["text"])

        # Training args
        training_args = TrainingArguments(
            output_dir=f"{self.model_cache_dir}/train_{task.task_id}",
            num_train_epochs=task.model_config.get("epochs", 3),
            per_device_train_batch_size=task.model_config.get("batch_size", 4),
            learning_rate=task.model_config.get("learning_rate", 2e-5),
            save_strategy="no",
            logging_steps=10,
            fp16=self.device == "cuda",
        )

        # Add padding token if needed
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
            model.config.pad_token_id = model.config.eos_token_id

        # Train
        trainer = Trainer(
            model=model,
            args=training_args,
            train_dataset=tokenized_dataset,
            data_collator=DataCollatorForLanguageModeling(tokenizer, mlm=False),
        )

        train_result = trainer.train()
        training_time = time.time() - start_time

        return model, tokenizer, train_result.training_loss, training_time

    def run_inference(self, model, tokenizer, scenario: CareScenario) -> Tuple[CoordinationPlan, float]:
        """Run inference on a single scenario"""
        start_time = time.time()

        prompt = self.scenario_to_prompt(scenario)
        inputs = tokenizer(prompt, return_tensors="pt").to(self.device)

        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=512,
                temperature=0.7,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id,
            )

        generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)

        # Extract JSON from generated text
        try:
            # Find JSON block
            start_idx = generated_text.find("{")
            end_idx = generated_text.rfind("}") + 1
            if start_idx != -1 and end_idx > start_idx:
                json_str = generated_text[start_idx:end_idx]
                plan_data = json.loads(json_str)
            else:
                # Fallback to baseline
                plan_data = json.loads(self._generate_baseline_plan(scenario))
        except:
            # Parse failed, use baseline
            plan_data = json.loads(self._generate_baseline_plan(scenario))

        inference_time = (time.time() - start_time) * 1000  # ms

        plan = CoordinationPlan(
            scenario_id=scenario.id,
            robot_assignments=plan_data.get("robot_assignments", {}),
            schedule=plan_data.get("schedule", []),
            total_time=plan_data.get("total_time", 0),
            coverage=plan_data.get("coverage", 0),
            fallback_plan=plan_data.get("fallback_plan"),
        )

        return plan, inference_time

    def compute_model_hash(self, model) -> str:
        """Compute SHA-256 hash of model weights"""
        hasher = hashlib.sha256()
        for param in model.parameters():
            hasher.update(param.data.cpu().numpy().tobytes())
        return hasher.hexdigest()

    def process_task(self, task: TrainingTask, benchmark_scenarios: List[CareScenario]) -> TrainingResult:
        """Main miner workflow: train model and generate predictions"""
        print(f"[Miner {self.miner_uid}] Processing task {task.task_id}")

        # Train model
        model, tokenizer, training_loss, training_time = self.train_model(task)

        # Compute model hash
        model_hash = self.compute_model_hash(model)
        print(f"[Miner {self.miner_uid}] Model hash: {model_hash[:16]}...")

        # Run inference on benchmark scenarios
        predictions = []
        inference_times = []

        for scenario in benchmark_scenarios:
            plan, inf_time = self.run_inference(model, tokenizer, scenario)
            predictions.append(plan)
            inference_times.append(inf_time)

        avg_inference_time = sum(inference_times) / len(inference_times) if inference_times else 0

        result = TrainingResult(
            task_id=task.task_id,
            miner_uid=self.miner_uid,
            model_weights_hash=model_hash,
            benchmark_predictions=predictions,
            training_loss=float(training_loss),
            training_time=training_time,
            avg_inference_time=avg_inference_time,
            gpu_info=self.gpu_info,
        )

        print(f"[Miner {self.miner_uid}] Task complete. Avg inference: {avg_inference_time:.2f}ms")

        return result


if __name__ == "__main__":
    # Test miner standalone
    miner = SwarmCareMiner(miner_uid=1)
    print(f"Miner initialized on {miner.device}")
    print(f"GPU Info: {miner.gpu_info}")
