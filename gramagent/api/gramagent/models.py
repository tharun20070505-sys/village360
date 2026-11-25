from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

ROLES = ['super_admin','panchayat_officer','college_admin','faculty','student','field_coordinator','public_viewer']
class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

class Observation(Strict):
    indicator: str = Field(min_length=1, max_length=100)
    sector: str = Field(min_length=1,max_length=80)
    value: float | None = Field(default=None,ge=0)
    denominator: float | None = Field(default=None,gt=0)
    unit: Literal['count','percent','INR','days'] = 'count'
    adverse: bool = True
    source: str = Field(min_length=1,max_length=500)
    source_date: date
    verified: bool = False
    latitude: float | None = Field(default=None,ge=-90,le=90)
    longitude: float | None = Field(default=None,ge=-180,le=180)
    public_location: bool = False
    @model_validator(mode='after')
    def validate_counts(self):
        if self.unit == 'percent' and self.value is not None and self.value > 100: raise ValueError('Percent exceeds 100')
        if self.unit == 'count' and self.value is not None and self.denominator is not None and self.value > self.denominator: raise ValueError('Count exceeds denominator')
        if self.source_date > date.today(): raise ValueError('Source date cannot be in the future')
        if (self.latitude is None) != (self.longitude is None): raise ValueError('Both coordinates are required')
        if self.latitude is not None and not self.public_location: raise ValueError('Only public infrastructure locations are accepted')
        return self

class SnapshotInput(Strict):
    village_id: str
    source_name: str = Field(min_length=1,max_length=200)
    synthetic: bool = False
    observations: list[Observation] = Field(min_length=1,max_length=5000)

class RunInput(Strict):
    snapshot_id: str
    objective: str = Field(default='Prepare an evidence-backed village development plan',min_length=10,max_length=1000)
    mode: Literal['analysis','ai'] = 'analysis'
    severity_weight: float = Field(default=0.6,ge=0,le=1)
    freshness_weight: float = Field(default=0.4,ge=0,le=1)
    @model_validator(mode='after')
    def weights(self):
        if abs(self.severity_weight+self.freshness_weight-1)>0.000001: raise ValueError('Weights must sum to one')
        return self

class Intervention(Strict):
    finding_id: str
    title: str = Field(min_length=5,max_length=200)
    category: Literal['immediate','short_term','long_term','technology','community','government','student']
    description: str = Field(max_length=2000)
    evidence_ids: list[str] = Field(min_length=1)
    stakeholder: str = Field(max_length=200)
    duration_months: int = Field(ge=1,le=120)
    success_indicator: str = Field(max_length=300)
    risks: list[str]
    dependencies: list[str]
    sdgs: list[int] = Field(default_factory=list)

class Solutions(Strict):
    interventions: list[Intervention] = Field(max_length=30)

class StudentProject(Strict):
    title: str
    finding_id: str
    department: str
    objectives: list[str]
    technology: list[str]
    skills: list[str]
    hardware: list[str]
    roadmap: list[str]
    deliverables: list[str]
    impact_indicator: str
class StudentProjects(Strict):
    projects: list[StudentProject] = Field(max_length=30)

class Decision(Strict):
    plan_hash: str
    decision: Literal['approve','reject']
    reason: str = Field(min_length=5,max_length=2000)

class CostInput(Strict):
    finding_id: str
    description: str = Field(min_length=3,max_length=200)
    quantity: float = Field(gt=0,le=1e9)
    unit_cost: float = Field(ge=0,le=1e9)
    source: str = Field(min_length=3,max_length=500)
    verified: bool = False
    contingency_percent: float = Field(default=10,ge=0,le=100)

class Scenario(Strict):
    budget: float = Field(ge=0,le=1e12)
    unit_cost: float = Field(gt=0,le=1e9)
    people_per_unit: float = Field(gt=0,le=1e6)
    months: int = Field(ge=1,le=120)
    monthly_capacity: int = Field(ge=1,le=1000000)
    assumptions: str = Field(min_length=10,max_length=2000)

class ImpactInput(Strict):
    indicator: str = Field(min_length=2,max_length=200)
    baseline: float
    target: float
    current: float
    unit: str = Field(min_length=1,max_length=40)
    measured_at: date
    evidence: str = Field(min_length=5,max_length=1000)
    spend: float = Field(default=0,ge=0)
    @model_validator(mode='after')
    def dates(self):
        if self.measured_at > date.today(): raise ValueError('Measurement date cannot be in the future')
        return self

class PriorityInput(Strict):
    finding_id:str
    severity:float | None=Field(default=None,ge=0,le=100)
    people_affected:float | None=Field(default=None,ge=0,le=100)
    urgency:float | None=Field(default=None,ge=0,le=100)
    social_impact:float | None=Field(default=None,ge=0,le=100)
    vulnerable_population:float | None=Field(default=None,ge=0,le=100)
    feasibility:float | None=Field(default=None,ge=0,le=100)
    cost_effectiveness:float | None=Field(default=None,ge=0,le=100)
    data_reliability:float | None=Field(default=None,ge=0,le=100)
    evidence:str=Field(min_length=10,max_length=3000)
    weights:dict[str,float]=Field(default_factory=lambda:{'severity':.2,'people_affected':.15,'urgency':.15,'social_impact':.15,'vulnerable_population':.1,'feasibility':.1,'cost_effectiveness':.05,'data_reliability':.1})
    @model_validator(mode='after')
    def validate_weights(self):
        keys={'severity','people_affected','urgency','social_impact','vulnerable_population','feasibility','cost_effectiveness','data_reliability'}
        if set(self.weights)!=keys or any(v<0 or v>1 for v in self.weights.values()) or abs(sum(self.weights.values())-1)>1e-6:raise ValueError('Provide all eight weights, each 0–1, summing to 1')
        return self

class AgentStrategy(Strict):
    sectors:list[str]
    tools:list[Literal['validate_observations','calculate_priority','retrieve_approved_documents','calculate_budget']]
    decision_summary:str=Field(max_length=1000)
class Critique(Strict):
    issues:list[str]=Field(max_length=20)
