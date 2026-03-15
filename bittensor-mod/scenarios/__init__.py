"""
SwarmCare Scenario Bank
"""

from .care_scenarios import (
    ALL_SCENARIOS,
    SCENARIO_HYDRATION_EASY,
    SCENARIO_EMERGENCY_HARD,
    SCENARIO_MEDICATION_MEDIUM,
    SCENARIO_NIGHT_CHECK_EASY,
    SCENARIO_SUPPLY_MEDIUM,
    get_scenarios_by_difficulty,
    get_scenario_by_id,
)

__all__ = [
    "ALL_SCENARIOS",
    "SCENARIO_HYDRATION_EASY",
    "SCENARIO_EMERGENCY_HARD",
    "SCENARIO_MEDICATION_MEDIUM",
    "SCENARIO_NIGHT_CHECK_EASY",
    "SCENARIO_SUPPLY_MEDIUM",
    "get_scenarios_by_difficulty",
    "get_scenario_by_id",
]
