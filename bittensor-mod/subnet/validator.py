"""
SwarmCare Validator

Judges miner model quality on accuracy, generalization, efficiency, and novelty.
Scores determine TAO emissions to miners.
"""

import random
import time
import json
from typing import List, Dict, Tuple
from protocol import (
    TrainingTask,
    TrainingResult,
    ModelScore,
    CareScenario,
    CoordinationPlan,
)
from scenarios.care_scenarios import ALL_SCENARIOS, get_scenario_by_id


class SwarmCareValidator:
    """Validator that scores miner models"""

    def __init__(self, validator_uid: int):
        self.validator_uid = validator_uid
        self.scenario_bank = ALL_SCENARIOS
        self.scoring_weights = {
            "accuracy": 0.40,
            "generalization": 0.25,
            "efficiency": 0.20,
            "novelty": 0.15,
        }

    def create_training_task(self, task_id: str) -> Tuple[TrainingTask, List[CareScenario]]:
        """
        Generate training task by randomly sampling from scenario bank.
        Returns: (task, benchmark_scenarios)
        """
        # Randomly sample 3-5 scenarios for training
        num_training = random.randint(3, 5)
        all_scenarios = self.scenario_bank.copy()
        random.shuffle(all_scenarios)

        training_scenarios = all_scenarios[:num_training]
        benchmark_scenarios = all_scenarios[num_training:num_training+2]  # 2 held-out

        # Strip optimal plans from benchmark scenarios
        benchmark_ids = [s.id for s in benchmark_scenarios]

        task = TrainingTask(
            task_id=task_id,
            training_scenarios=training_scenarios,
            benchmark_scenario_ids=benchmark_ids,
            deadline=time.time() + 3600,  # 1 hour deadline
        )

        return task, benchmark_scenarios

    def score_accuracy(self, prediction: CoordinationPlan, optimal: Dict) -> float:
        """
        Score accuracy: does plan cover residents, meet constraints, match optimal?
        Returns: 0.0 to 1.0
        """
        score = 0.0

        # Coverage check (40% of accuracy score)
        if prediction.coverage >= 0.95:
            score += 0.40
        else:
            score += 0.40 * prediction.coverage

        # Assignment completeness (30%)
        optimal_assignments = optimal.get("robot_assignments", {})
        pred_residents = set()
        for residents in prediction.robot_assignments.values():
            pred_residents.update(residents)

        optimal_residents = set()
        for residents in optimal_assignments.values():
            optimal_residents.update(residents)

        if optimal_residents:
            coverage_ratio = len(pred_residents & optimal_residents) / len(optimal_residents)
            score += 0.30 * coverage_ratio

        # Time efficiency (30%)
        optimal_time = optimal.get("total_time", float('inf'))
        if prediction.total_time <= optimal_time * 1.2:  # Within 20% of optimal
            score += 0.30
        elif prediction.total_time <= optimal_time * 1.5:  # Within 50%
            score += 0.15

        return min(1.0, max(0.0, score))

    def score_generalization(self, results: List[Tuple[CoordinationPlan, Dict]]) -> float:
        """
        Score generalization: consistent performance across easy AND hard scenarios.
        Returns: 0.0 to 1.0
        """
        if len(results) < 2:
            return 0.0

        # Calculate accuracy for each benchmark
        accuracies = [self.score_accuracy(plan, optimal) for plan, optimal in results]

        # Generalization is penalized by variance
        mean_acc = sum(accuracies) / len(accuracies)
        variance = sum((acc - mean_acc) ** 2 for acc in accuracies) / len(accuracies)

        # Lower variance = better generalization
        gen_score = mean_acc * (1.0 - min(variance, 1.0))

        return min(1.0, max(0.0, gen_score))

    def score_efficiency(self, avg_inference_time: float) -> float:
        """
        Score efficiency: faster inference = higher score.
        Target: <500ms per scenario. Returns: 0.0 to 1.0
        """
        target_time = 500.0  # ms
        max_acceptable = 2000.0  # ms

        if avg_inference_time <= target_time:
            return 1.0
        elif avg_inference_time >= max_acceptable:
            return 0.0
        else:
            # Linear decay between target and max
            return 1.0 - (avg_inference_time - target_time) / (max_acceptable - target_time)

    def score_novelty(self, prediction: CoordinationPlan, optimal: Dict) -> float:
        """
        Score novelty: discovers plans BETTER than known optimal.
        Returns: 0.0 to 1.0
        """
        score = 0.0

        optimal_time = optimal.get("total_time", float('inf'))

        # Better time than optimal = novelty bonus
        if prediction.total_time < optimal_time:
            improvement = (optimal_time - prediction.total_time) / optimal_time
            score += min(0.50, improvement)  # Up to 50% for better time

        # Fallback plan present = +0.25
        if prediction.fallback_plan:
            score += 0.25

        # Higher coverage than optimal = +0.25
        optimal_coverage = optimal.get("coverage", 1.0)
        if prediction.coverage > optimal_coverage:
            score += 0.25

        return min(1.0, max(0.0, score))

    def score_miner_result(self, result: TrainingResult, benchmark_scenarios: List[CareScenario]) -> ModelScore:
        """
        Score a miner's training result across all metrics.
        Returns: ModelScore with weighted total
        """
        # Match predictions to scenarios
        prediction_pairs = []
        for pred in result.benchmark_predictions:
            scenario = get_scenario_by_id(pred.scenario_id)
            if scenario and scenario.optimal_plan:
                prediction_pairs.append((pred, scenario.optimal_plan))

        if not prediction_pairs:
            # No valid predictions
            return ModelScore(
                miner_uid=result.miner_uid,
                accuracy_score=0.0,
                generalization_score=0.0,
                efficiency_score=0.0,
                novelty_score=0.0,
                total_score=0.0,
            )

        # Compute individual scores
        accuracy_scores = [self.score_accuracy(pred, opt) for pred, opt in prediction_pairs]
        accuracy = sum(accuracy_scores) / len(accuracy_scores)

        generalization = self.score_generalization(prediction_pairs)

        efficiency = self.score_efficiency(result.avg_inference_time)

        novelty_scores = [self.score_novelty(pred, opt) for pred, opt in prediction_pairs]
        novelty = sum(novelty_scores) / len(novelty_scores)

        # Compute weighted total
        total = (
            accuracy * self.scoring_weights["accuracy"] +
            generalization * self.scoring_weights["generalization"] +
            efficiency * self.scoring_weights["efficiency"] +
            novelty * self.scoring_weights["novelty"]
        )

        score = ModelScore(
            miner_uid=result.miner_uid,
            accuracy_score=accuracy,
            generalization_score=generalization,
            efficiency_score=efficiency,
            novelty_score=novelty,
            total_score=total,
            weights=self.scoring_weights,
        )

        print(f"[Validator {self.validator_uid}] Scored Miner {result.miner_uid}:")
        print(f"  Accuracy: {accuracy:.3f} | Generalization: {generalization:.3f}")
        print(f"  Efficiency: {efficiency:.3f} | Novelty: {novelty:.3f}")
        print(f"  TOTAL: {total:.3f}")

        return score

    def rank_miners(self, scores: List[ModelScore]) -> List[ModelScore]:
        """Rank miners by total score (descending)"""
        return sorted(scores, key=lambda s: s.total_score, reverse=True)


if __name__ == "__main__":
    # Test validator standalone
    validator = SwarmCareValidator(validator_uid=0)
    task, benchmarks = validator.create_training_task("test_001")

    print(f"Task created: {task.task_id}")
    print(f"Training scenarios: {len(task.training_scenarios)}")
    print(f"Benchmark scenarios: {len(benchmarks)}")
    print(f"Benchmark IDs: {task.benchmark_scenario_ids}")
