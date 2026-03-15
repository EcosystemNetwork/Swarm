"""
SwarmCare Bittensor Subnet - End-to-End Demo

Run this to see the complete subnet workflow:
1. Validator creates training task
2. Miner trains model on GPU
3. Miner returns predictions
4. Validator scores model quality
5. Best model can be deployed to Swarm

Usage:
    python demo.py
"""

import sys
import os

# Add subnet to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "subnet"))
sys.path.insert(0, os.path.dirname(__file__))

from subnet.validator import SwarmCareValidator
from subnet.miner import SwarmCareMiner
from scenarios.care_scenarios import get_scenario_by_id
import json


def print_banner(text):
    print("\n" + "=" * 70)
    print(f"  {text}")
    print("=" * 70 + "\n")


def main():
    print_banner("SwarmCare Bittensor Subnet - Full Demo")

    # ═══════════════════════════════════════════════════════════════
    # Step 1: Initialize Validator
    # ═══════════════════════════════════════════════════════════════
    print_banner("Step 1: Initialize Validator")
    validator = SwarmCareValidator(validator_uid=0)
    print(f"✓ Validator {validator.validator_uid} initialized")
    print(f"✓ Scenario bank loaded: {len(validator.scenario_bank)} scenarios")
    print(f"✓ Scoring weights: {validator.scoring_weights}")

    # ═══════════════════════════════════════════════════════════════
    # Step 2: Create Training Task
    # ═══════════════════════════════════════════════════════════════
    print_banner("Step 2: Validator Creates Training Task")
    task, benchmark_scenarios = validator.create_training_task("demo_task_001")

    print(f"✓ Task ID: {task.task_id}")
    print(f"✓ Training scenarios: {len(task.training_scenarios)}")
    for i, scenario in enumerate(task.training_scenarios, 1):
        print(f"  {i}. {scenario.id} - {scenario.type.value} ({scenario.difficulty.value})")

    print(f"\n✓ Benchmark scenarios (held-out): {len(benchmark_scenarios)}")
    for i, scenario in enumerate(benchmark_scenarios, 1):
        print(f"  {i}. {scenario.id} - {scenario.type.value} ({scenario.difficulty.value})")

    # ═══════════════════════════════════════════════════════════════
    # Step 3: Initialize Miners
    # ═══════════════════════════════════════════════════════════════
    print_banner("Step 3: Initialize Miners")

    # Simulate 3 miners competing
    miners = [
        SwarmCareMiner(miner_uid=1),
        SwarmCareMiner(miner_uid=2),
        SwarmCareMiner(miner_uid=3),
    ]

    for miner in miners:
        print(f"✓ Miner {miner.miner_uid} initialized on {miner.device}")
        print(f"  GPU: {miner.gpu_info}")

    # ═══════════════════════════════════════════════════════════════
    # Step 4: Miners Train Models
    # ═══════════════════════════════════════════════════════════════
    print_banner("Step 4: Miners Train Models (This May Take Time...)")

    miner_results = []

    for miner in miners:
        print(f"\n[Miner {miner.miner_uid}] Starting training...")

        try:
            result = miner.process_task(task, benchmark_scenarios)
            miner_results.append(result)

            print(f"✓ Miner {miner.miner_uid} completed task")
            print(f"  Model hash: {result.model_weights_hash[:16]}...")
            print(f"  Training loss: {result.training_loss:.4f}")
            print(f"  Training time: {result.training_time:.2f}s")
            print(f"  Avg inference: {result.avg_inference_time:.2f}ms")
            print(f"  Predictions: {len(result.benchmark_predictions)}")

        except Exception as e:
            print(f"✗ Miner {miner.miner_uid} failed: {e}")
            continue

    # ═══════════════════════════════════════════════════════════════
    # Step 5: Validator Scores Results
    # ═══════════════════════════════════════════════════════════════
    print_banner("Step 5: Validator Scores Miner Results")

    scores = []
    for result in miner_results:
        score = validator.score_miner_result(result, benchmark_scenarios)
        scores.append(score)

    # ═══════════════════════════════════════════════════════════════
    # Step 6: Rank Miners
    # ═══════════════════════════════════════════════════════════════
    print_banner("Step 6: Final Rankings & TAO Emissions")

    ranked = validator.rank_miners(scores)

    print("Leaderboard (Total Score):")
    print("-" * 70)
    for i, score in enumerate(ranked, 1):
        print(f"{i}. Miner {score.miner_uid} - Total: {score.total_score:.3f}")
        print(f"   Accuracy: {score.accuracy_score:.3f} | "
              f"Generalization: {score.generalization_score:.3f}")
        print(f"   Efficiency: {score.efficiency_score:.3f} | "
              f"Novelty: {score.novelty_score:.3f}")
        print()

    # ═══════════════════════════════════════════════════════════════
    # Step 7: Best Model Info
    # ═══════════════════════════════════════════════════════════════
    if ranked:
        print_banner("Step 7: Best Model Ready for Deployment")

        best_score = ranked[0]
        best_result = next(r for r in miner_results if r.miner_uid == best_score.miner_uid)

        print(f"🏆 Winner: Miner {best_score.miner_uid}")
        print(f"✓ Model hash: {best_result.model_weights_hash}")
        print(f"✓ Total score: {best_score.total_score:.3f}")
        print(f"✓ Ready for deployment to Swarm Protocol")

        print("\nNext steps:")
        print("  1. Run: python scripts/pull_best_model.py")
        print("  2. Model will be deployed to Swarm agent fleet")
        print("  3. Care facilities can use community-trained coordination AI")

    # ═══════════════════════════════════════════════════════════════
    # Demo Complete
    # ═══════════════════════════════════════════════════════════════
    print_banner("Demo Complete!")

    print("✓ SwarmCare subnet workflow demonstrated end-to-end")
    print("✓ Miners trained models using GPU compute")
    print("✓ Validator scored model quality fairly")
    print("✓ Best model identified for Swarm deployment")
    print("\nSubnet ready for Bittensor testnet/mainnet deployment.")


if __name__ == "__main__":
    main()
