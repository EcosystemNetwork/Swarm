"""
SwarmCare Bittensor Subnet Protocol

Defines the communication protocol between validators and miners for
decentralized AI model training for elderly care coordination.
"""

from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field
from enum import Enum


class TaskType(str, Enum):
    """Types of care coordination tasks"""
    HYDRATION_ROUND = "hydration_round"
    MEDICATION_DELIVERY = "medication_delivery"
    EMERGENCY_RESPONSE = "emergency_response"
    NIGHT_CHECK = "night_check"
    SUPPLY_DELIVERY = "supply_delivery"
    ROUTINE_MONITORING = "routine_monitoring"


class DifficultyLevel(str, Enum):
    """Scenario difficulty ratings"""
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    EXPERT = "expert"


class Resident(BaseModel):
    """Resident in care facility"""
    id: str
    name: str
    room: str
    floor: int
    mobility: str  # "ambulatory", "wheelchair", "bedridden"
    priority: int = Field(ge=1, le=5)  # 1=low, 5=critical
    special_needs: List[str] = []


class Robot(BaseModel):
    """Robot agent in the facility"""
    id: str
    type: str  # "delivery", "monitoring", "assistance"
    current_location: str
    battery_level: float = Field(ge=0.0, le=1.0)
    capacity: int  # items/residents it can handle at once
    speed: float  # floors per minute
    status: str = "available"  # "available", "busy", "offline"


class CareScenario(BaseModel):
    """A care coordination scenario"""
    id: str
    type: TaskType
    difficulty: DifficultyLevel
    residents: List[Resident]
    robots: List[Robot]
    constraints: Dict[str, Any]
    optimal_plan: Optional[Dict[str, Any]] = None
    description: str


class TrainingTask(BaseModel):
    """Task sent from validator to miner"""
    task_id: str
    training_scenarios: List[CareScenario]
    benchmark_scenario_ids: List[str]  # IDs only, no solutions
    model_config: Dict[str, Any] = {
        "base_model": "meta-llama/Llama-3.2-1B",
        "epochs": 3,
        "learning_rate": 2e-5,
        "batch_size": 4,
        "max_length": 2048,
    }
    deadline: float  # Unix timestamp


class CoordinationPlan(BaseModel):
    """Output from trained model"""
    scenario_id: str
    robot_assignments: Dict[str, List[str]]  # robot_id -> [resident_ids]
    schedule: List[Dict[str, Any]]  # time-ordered actions
    total_time: float  # minutes
    coverage: float  # % of residents covered
    fallback_plan: Optional[Dict[str, Any]] = None


class TrainingResult(BaseModel):
    """Result returned from miner to validator"""
    task_id: str
    miner_uid: int
    model_weights_hash: str  # SHA-256 hash of trained weights
    benchmark_predictions: List[CoordinationPlan]
    training_loss: float
    training_time: float  # seconds
    avg_inference_time: float  # ms per scenario
    gpu_info: Dict[str, str]


class ModelScore(BaseModel):
    """Validator's scoring of a miner's model"""
    miner_uid: int
    accuracy_score: float = Field(ge=0.0, le=1.0)
    generalization_score: float = Field(ge=0.0, le=1.0)
    efficiency_score: float = Field(ge=0.0, le=1.0)
    novelty_score: float = Field(ge=0.0, le=1.0)
    total_score: float = Field(ge=0.0, le=1.0)
    weights: Dict[str, float] = {
        "accuracy": 0.40,
        "generalization": 0.25,
        "efficiency": 0.20,
        "novelty": 0.15,
    }

    def compute_total(self) -> float:
        """Compute weighted total score"""
        return (
            self.accuracy_score * self.weights["accuracy"] +
            self.generalization_score * self.weights["generalization"] +
            self.efficiency_score * self.weights["efficiency"] +
            self.novelty_score * self.weights["novelty"]
        )


# Synapse definitions for Bittensor communication
class TrainingSynapse(BaseModel):
    """Synapse carrying training task from validator to miner"""
    axon: Optional[Any] = None
    dendrite: Optional[Any] = None
    task: TrainingTask


class ResultSynapse(BaseModel):
    """Synapse carrying training result from miner to validator"""
    axon: Optional[Any] = None
    dendrite: Optional[Any] = None
    result: TrainingResult
