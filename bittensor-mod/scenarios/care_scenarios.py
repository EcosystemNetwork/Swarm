"""
SwarmCare Scenario Bank

Built-in elderly care coordination scenarios for training and benchmarking.
Covers hydration rounds, medication delivery, emergencies, night checks, and supply delivery.
"""

from subnet.protocol import (
    CareScenario,
    Resident,
    Robot,
    TaskType,
    DifficultyLevel,
)


# ═══════════════════════════════════════════════════════════════
# Scenario 1: Morning Hydration Round (Easy)
# ═══════════════════════════════════════════════════════════════

SCENARIO_HYDRATION_EASY = CareScenario(
    id="hydration_001",
    type=TaskType.HYDRATION_ROUND,
    difficulty=DifficultyLevel.EASY,
    description="Morning hydration round for 6 residents on Floor 2",
    residents=[
        Resident(id="R01", name="Mary Johnson", room="201", floor=2, mobility="ambulatory", priority=2),
        Resident(id="R02", name="John Smith", room="203", floor=2, mobility="wheelchair", priority=3),
        Resident(id="R03", name="Alice Brown", room="205", floor=2, mobility="ambulatory", priority=2),
        Resident(id="R04", name="Robert Davis", room="207", floor=2, mobility="wheelchair", priority=3),
        Resident(id="R05", name="Emma Wilson", room="209", floor=2, mobility="ambulatory", priority=2),
        Resident(id="R06", name="James Taylor", room="211", floor=2, mobility="ambulatory", priority=2),
    ],
    robots=[
        Robot(id="BOT_D1", type="delivery", current_location="200", battery_level=0.95, capacity=6, speed=1.5),
        Robot(id="BOT_D2", type="delivery", current_location="210", battery_level=0.90, capacity=6, speed=1.5),
        Robot(id="BOT_M1", type="monitoring", current_location="205", battery_level=0.85, capacity=4, speed=2.0),
    ],
    constraints={
        "max_time_minutes": 30,
        "priority_first": True,
        "batch_delivery": True,
        "quiet_hours": False,
    },
    optimal_plan={
        "robot_assignments": {
            "BOT_D1": ["R02", "R04", "R01"],
            "BOT_D2": ["R03", "R05", "R06"],
        },
        "schedule": [
            {"time": 0, "robot": "BOT_D1", "action": "collect_water", "location": "supply_room"},
            {"time": 2, "robot": "BOT_D2", "action": "collect_water", "location": "supply_room"},
            {"time": 4, "robot": "BOT_D1", "action": "deliver_to_R02", "location": "203"},
            {"time": 6, "robot": "BOT_D2", "action": "deliver_to_R03", "location": "205"},
            {"time": 8, "robot": "BOT_D1", "action": "deliver_to_R04", "location": "207"},
            {"time": 10, "robot": "BOT_D2", "action": "deliver_to_R05", "location": "209"},
            {"time": 12, "robot": "BOT_D1", "action": "deliver_to_R01", "location": "201"},
            {"time": 14, "robot": "BOT_D2", "action": "deliver_to_R06", "location": "211"},
        ],
        "total_time": 16,
        "coverage": 1.0,
        "fallback_plan": {"backup_robot": "BOT_M1", "manual_intervention": False},
    }
)


# ═══════════════════════════════════════════════════════════════
# Scenario 2: Emergency Response (Hard)
# ═══════════════════════════════════════════════════════════════

SCENARIO_EMERGENCY_HARD = CareScenario(
    id="emergency_001",
    type=TaskType.EMERGENCY_RESPONSE,
    difficulty=DifficultyLevel.HARD,
    description="Fall detection in Room 305 - immediate reroute required",
    residents=[
        Resident(id="R10", name="Sarah Connor", room="305", floor=3, mobility="ambulatory", priority=5, special_needs=["fall_detected"]),
        Resident(id="R11", name="Tom Anderson", room="307", floor=3, mobility="wheelchair", priority=3),
        Resident(id="R12", name="Lisa Martinez", room="310", floor=3, mobility="bedridden", priority=4, special_needs=["heart_monitor"]),
    ],
    robots=[
        Robot(id="BOT_A1", type="assistance", current_location="301", battery_level=0.75, capacity=1, speed=3.0),
        Robot(id="BOT_M2", type="monitoring", current_location="312", battery_level=0.60, capacity=2, speed=2.5),
        Robot(id="BOT_D3", type="delivery", current_location="supply_room", battery_level=0.40, capacity=4, speed=1.5, status="busy"),
    ],
    constraints={
        "max_time_minutes": 5,
        "priority_first": True,
        "emergency_override": True,
        "notify_staff": True,
    },
    optimal_plan={
        "robot_assignments": {
            "BOT_A1": ["R10"],
            "BOT_M2": ["R10", "R12"],
        },
        "schedule": [
            {"time": 0, "robot": "BOT_A1", "action": "emergency_navigate_to_R10", "location": "305"},
            {"time": 0.5, "robot": "BOT_M2", "action": "reroute_to_R10", "location": "305"},
            {"time": 1, "robot": "BOT_A1", "action": "assess_R10", "location": "305"},
            {"time": 2, "robot": "BOT_A1", "action": "alert_staff", "location": "305"},
            {"time": 2.5, "robot": "BOT_M2", "action": "monitor_vitals_R10", "location": "305"},
            {"time": 3, "robot": "BOT_M2", "action": "check_R12_heart_monitor", "location": "310"},
        ],
        "total_time": 4.5,
        "coverage": 0.66,  # R11 not covered due to emergency priority
        "fallback_plan": {
            "backup_robot": "BOT_D3",
            "manual_intervention": True,
            "staff_notification": "immediate",
        },
    }
)


# ═══════════════════════════════════════════════════════════════
# Scenario 3: Medication Round (Medium)
# ═══════════════════════════════════════════════════════════════

SCENARIO_MEDICATION_MEDIUM = CareScenario(
    id="medication_001",
    type=TaskType.MEDICATION_DELIVERY,
    difficulty=DifficultyLevel.MEDIUM,
    description="Evening medication delivery with one robot offline",
    residents=[
        Resident(id="R20", name="Dorothy Williams", room="401", floor=4, mobility="wheelchair", priority=4),
        Resident(id="R21", name="George Lee", room="403", floor=4, mobility="ambulatory", priority=3),
        Resident(id="R22", name="Helen Garcia", room="405", floor=4, mobility="bedridden", priority=5, special_needs=["critical_meds"]),
        Resident(id="R23", name="Frank Robinson", room="407", floor=4, mobility="ambulatory", priority=3),
        Resident(id="R24", name="Grace Thomas", room="409", floor=4, mobility="wheelchair", priority=4),
        Resident(id="R25", name="Henry Clark", room="411", floor=4, mobility="ambulatory", priority=2),
        Resident(id="R26", name="Irene Lopez", room="413", floor=4, mobility="bedridden", priority=4),
        Resident(id="R27", name="Jack Walker", room="415", floor=4, mobility="ambulatory", priority=3),
    ],
    robots=[
        Robot(id="BOT_D4", type="delivery", current_location="pharmacy", battery_level=0.95, capacity=8, speed=1.5),
        Robot(id="BOT_D5", type="delivery", current_location="410", battery_level=0.30, capacity=8, speed=1.5, status="offline"),
        Robot(id="BOT_M3", type="monitoring", current_location="405", battery_level=0.70, capacity=3, speed=2.0),
    ],
    constraints={
        "max_time_minutes": 45,
        "priority_first": True,
        "medication_verification": True,
        "time_window": "18:00-19:00",
    },
    optimal_plan={
        "robot_assignments": {
            "BOT_D4": ["R22", "R20", "R24", "R21", "R23", "R25", "R27"],
            "BOT_M3": ["R26"],
        },
        "schedule": [
            {"time": 0, "robot": "BOT_D4", "action": "load_medications", "location": "pharmacy"},
            {"time": 5, "robot": "BOT_D4", "action": "deliver_critical_R22", "location": "405"},
            {"time": 10, "robot": "BOT_D4", "action": "deliver_R20", "location": "401"},
            {"time": 15, "robot": "BOT_M3", "action": "deliver_R26", "location": "413"},
            {"time": 18, "robot": "BOT_D4", "action": "deliver_R24", "location": "409"},
            {"time": 23, "robot": "BOT_D4", "action": "deliver_R21", "location": "403"},
            {"time": 27, "robot": "BOT_D4", "action": "deliver_R23", "location": "407"},
            {"time": 31, "robot": "BOT_D4", "action": "deliver_R25", "location": "411"},
            {"time": 35, "robot": "BOT_D4", "action": "deliver_R27", "location": "415"},
        ],
        "total_time": 38,
        "coverage": 1.0,
        "fallback_plan": {
            "backup_robot": None,
            "manual_intervention": "if_BOT_D4_fails",
            "priority_order": ["R22", "R20", "R24", "R26"],
        },
    }
)


# ═══════════════════════════════════════════════════════════════
# Scenario 4: Night Check (Easy)
# ═══════════════════════════════════════════════════════════════

SCENARIO_NIGHT_CHECK_EASY = CareScenario(
    id="night_check_001",
    type=TaskType.NIGHT_CHECK,
    difficulty=DifficultyLevel.EASY,
    description="Quiet night rounds - minimal noise required",
    residents=[
        Resident(id="R30", name="Margaret Young", room="501", floor=5, mobility="ambulatory", priority=2),
        Resident(id="R31", name="Paul King", room="503", floor=5, mobility="wheelchair", priority=3),
        Resident(id="R32", name="Nancy Wright", room="505", floor=5, mobility="bedridden", priority=4, special_needs=["vitals_check"]),
        Resident(id="R33", name="Oscar Scott", room="507", floor=5, mobility="ambulatory", priority=2),
    ],
    robots=[
        Robot(id="BOT_M4", type="monitoring", current_location="500", battery_level=0.80, capacity=4, speed=1.0),
    ],
    constraints={
        "max_time_minutes": 20,
        "quiet_hours": True,
        "minimal_light": True,
        "vitals_check_required": ["R32"],
    },
    optimal_plan={
        "robot_assignments": {
            "BOT_M4": ["R30", "R31", "R32", "R33"],
        },
        "schedule": [
            {"time": 0, "robot": "BOT_M4", "action": "quiet_check_R30", "location": "501"},
            {"time": 4, "robot": "BOT_M4", "action": "quiet_check_R31", "location": "503"},
            {"time": 8, "robot": "BOT_M4", "action": "vitals_check_R32", "location": "505"},
            {"time": 14, "robot": "BOT_M4", "action": "quiet_check_R33", "location": "507"},
        ],
        "total_time": 18,
        "coverage": 1.0,
        "fallback_plan": {"backup_robot": None, "manual_intervention": "only_if_alert"},
    }
)


# ═══════════════════════════════════════════════════════════════
# Scenario 5: Supply Delivery (Medium)
# ═══════════════════════════════════════════════════════════════

SCENARIO_SUPPLY_MEDIUM = CareScenario(
    id="supply_001",
    type=TaskType.SUPPLY_DELIVERY,
    difficulty=DifficultyLevel.MEDIUM,
    description="Supply run to 4 rooms - avoid sleeping resident",
    residents=[
        Resident(id="R40", name="Quinn Harris", room="601", floor=6, mobility="ambulatory", priority=2),
        Resident(id="R41", name="Rachel Allen", room="603", floor=6, mobility="wheelchair", priority=3),
        Resident(id="R42", name="Steven Baker", room="605", floor=6, mobility="ambulatory", priority=2, special_needs=["sleeping"]),
        Resident(id="R43", name="Tina Nelson", room="607", floor=6, mobility="bedridden", priority=4),
    ],
    robots=[
        Robot(id="BOT_D6", type="delivery", current_location="supply_room", battery_level=0.85, capacity=4, speed=1.5),
        Robot(id="BOT_D7", type="delivery", current_location="610", battery_level=0.65, capacity=4, speed=1.5),
    ],
    constraints={
        "max_time_minutes": 25,
        "avoid_sleeping": ["R42"],
        "batch_delivery": True,
    },
    optimal_plan={
        "robot_assignments": {
            "BOT_D6": ["R40", "R43"],
            "BOT_D7": ["R41"],
        },
        "schedule": [
            {"time": 0, "robot": "BOT_D6", "action": "load_supplies", "location": "supply_room"},
            {"time": 3, "robot": "BOT_D7", "action": "load_supplies", "location": "supply_room"},
            {"time": 6, "robot": "BOT_D6", "action": "deliver_R40", "location": "601"},
            {"time": 9, "robot": "BOT_D7", "action": "deliver_R41", "location": "603"},
            {"time": 12, "robot": "BOT_D6", "action": "deliver_R43", "location": "607"},
            {"time": 18, "robot": "BOT_D6", "action": "deliver_R42_when_awake", "location": "605"},
        ],
        "total_time": 22,
        "coverage": 1.0,
        "fallback_plan": {
            "backup_robot": "BOT_D7",
            "manual_intervention": False,
            "defer_sleeping_resident": True,
        },
    }
)


# ═══════════════════════════════════════════════════════════════
# Scenario Bank Registry
# ═══════════════════════════════════════════════════════════════

ALL_SCENARIOS = [
    SCENARIO_HYDRATION_EASY,
    SCENARIO_EMERGENCY_HARD,
    SCENARIO_MEDICATION_MEDIUM,
    SCENARIO_NIGHT_CHECK_EASY,
    SCENARIO_SUPPLY_MEDIUM,
]


def get_scenarios_by_difficulty(difficulty: DifficultyLevel) -> list[CareScenario]:
    """Filter scenarios by difficulty level"""
    return [s for s in ALL_SCENARIOS if s.difficulty == difficulty]


def get_scenario_by_id(scenario_id: str) -> CareScenario | None:
    """Get scenario by ID"""
    for scenario in ALL_SCENARIOS:
        if scenario.id == scenario_id:
            return scenario
    return None
