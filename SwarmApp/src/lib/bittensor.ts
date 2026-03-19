/**
 * Bittensor SwarmCare Subnet Mod Manifest
 *
 * Decentralized AI model training for elderly care coordination.
 * Miners compete to fine-tune LLaMA models on care scenarios.
 * Validators score models on accuracy, generalization, efficiency, and novelty.
 */

import type { ModManifest } from "./skills";

export const BITTENSOR_MANIFEST: ModManifest = {
    tools: [
        {
            id: "bittensor-miner",
            name: "Subnet Miner",
            description: "GPU worker that trains care coordination models on Bittensor subnet",
            icon: "⛏️",
            category: "Training",
            status: "active",
            usageExample: "python bittensor-mod/subnet/miner.py --miner-uid 1",
        },
        {
            id: "bittensor-validator",
            name: "Subnet Validator",
            description: "Scores miner models on 4 metrics and distributes TAO emissions",
            icon: "✅",
            category: "Validation",
            status: "active",
            usageExample: "python bittensor-mod/subnet/validator.py --validator-uid 0",
        },
        {
            id: "bittensor-demo",
            name: "End-to-End Demo",
            description: "Full subnet workflow from training to deployment",
            icon: "🎬",
            category: "Testing",
            status: "active",
            usageExample: "python bittensor-mod/demo.py",
        },
    ],
    workflows: [
        {
            id: "train-and-deploy",
            name: "Train & Deploy Winning Model",
            description: "Train models on Bittensor subnet and deploy the highest-scoring model to Swarm Protocol agents",
            icon: "🚀",
            tags: ["training", "deployment", "ai"],
            steps: [
                "Validator creates training task with care scenarios",
                "Miners fine-tune LLaMA-3.2-1B models",
                "Validators score models (accuracy, generalization, efficiency, novelty)",
                "Highest-scoring model is deployed to Swarm Protocol",
            ],
            estimatedTime: "15-30 minutes",
        },
        {
            id: "scenario-generation",
            name: "Generate Care Scenarios",
            description: "Create diverse elderly care coordination scenarios for training",
            icon: "📋",
            tags: ["scenarios", "generation"],
            steps: [
                "Define task type (emergency, medication, hydration, etc.)",
                "Generate resident profiles with mobility and priority levels",
                "Create robot fleet with capabilities and constraints",
                "Define optimal coordination plan",
            ],
            estimatedTime: "5 minutes",
        },
    ],
    examples: [
        {
            id: "emergency-response",
            name: "Emergency Fall Detection",
            description: "Train model to coordinate robot response to fall detection",
            icon: "🚨",
            tags: ["emergency", "hard"],
            codeSnippet: `from scenarios.care_scenarios import SCENARIO_EMERGENCY_HARD
from subnet.miner import SwarmCareMiner

miner = SwarmCareMiner(miner_uid=1)
model, tokenizer = miner.train_model(
    scenarios=[SCENARIO_EMERGENCY_HARD],
    epochs=3
)`,
            language: "python",
        },
        {
            id: "hydration-round",
            name: "Hydration Round Optimization",
            description: "Optimize robot routes for water delivery across facility",
            icon: "💧",
            tags: ["hydration", "easy"],
            codeSnippet: `from scenarios.care_scenarios import SCENARIO_HYDRATION_EASY
from subnet.validator import SwarmCareValidator

validator = SwarmCareValidator(validator_uid=0)
score = validator.score_miner_result(result, [SCENARIO_HYDRATION_EASY])
print(f"Model score: {score.total_score:.2f}")`,
            language: "python",
        },
    ],
    agentSkills: [
        {
            id: "bittensor.care.train",
            name: "Train Care Model",
            description: "Fine-tune LLaMA model on elderly care coordination scenarios",
            type: "skill",
            invocation: "train_care_model(scenarios, epochs=3)",
            exampleInput: '{"scenarios": ["emergency_001"], "epochs": 3}',
            exampleOutput: '{"model_hash": "7f3c9a...", "training_loss": 0.234, "training_time": 450.2}',
        },
        {
            id: "bittensor.care.infer",
            name: "Infer Care Coordination",
            description: "Generate optimal care coordination plan using trained model",
            type: "skill",
            invocation: "infer_care_plan(scenario)",
            exampleInput: '{"residents": [...], "robots": [...], "constraints": {...}}',
            exampleOutput: '{"plan": {"BOT_A1": ["R10", "R11"], "BOT_B2": ["R12"]}, "estimated_time": 8.5}',
        },
        {
            id: "bittensor.subnet.deploy",
            name: "Deploy Winning Model",
            description: "Deploy highest-scoring model from subnet to Swarm agent fleet",
            type: "skill",
            invocation: "deploy_subnet_model()",
            exampleInput: '{"subnet_id": "swarmcare", "min_score": 0.75}',
            exampleOutput: '{"deployed": true, "model_hash": "7f3c9a...", "score": 0.87, "agents_updated": 12}',
        },
    ],
};
