% qgenda schedule model. Target-language artifact fed validated data by encodeScenario.ts.
% Indexes are adapter-local 1-based integers (PROV/DAY/SLOT/BLK); TS owns branded IDs.
% Constraints are the hard rules; the objective is a hierarchical sum over soft tiers.
include "alldifferent.mzn";

% --- index spaces ---
int: P;
int: D;
int: S;
int: B;
set of int: PROV = 1..P;
set of int: DAY = 1..D;
set of int: SLOT = 1..S;
set of int: BLK = 1..B;

% --- per-slot params ---
array[SLOT] of DAY: slot_day;
array[SLOT] of bool: slot_req_call;
array[SLOT] of bool: slot_eye;
array[SLOT] of bool: slot_dental;
array[SLOT] of bool: slot_is_first;
array[SLOT] of bool: slot_is_second;
array[SLOT] of bool: slot_is_middle;
array[SLOT] of bool: slot_is_last;

% --- per-day params ---
array[DAY] of bool: day_call_required;
array[DAY] of 0..S: first_slot_of_day;
array[DAY] of int: call_weight;
array[DAY] of bool: day_weekend;
array[DAY] of bool: day_holiday;

% --- per-provider params ---
array[PROV, DAY] of bool: avail;
array[PROV] of bool: call_elig;
array[PROV] of bool: eye_elig;
array[PROV] of bool: dental_elig;

% --- weekend block params ---
array[BLK, DAY] of bool: block_day;
array[BLK] of bool: block_split;
array[BLK] of int: block_required;

% --- targets (call/weekend/holiday scaled x100 to match call_weight) ---
array[PROV] of int: target_call;
array[PROV] of int: target_weekend;
array[PROV] of int: target_holiday;
array[PROV] of int: target_first;
array[PROV] of int: target_second;
array[PROV] of int: target_middle;
array[PROV] of int: target_last;
array[PROV] of int: target_eye;
array[PROV] of int: target_dental;
array[PROV] of int: target_workday;

int: weight_first;
int: weight_second;
int: weight_middle;
int: weight_last;
int: weight_eye;
int: weight_dental;

% --- decision: each slot gets exactly one provider (H_COVER_ALL_SLOTS) ---
array[SLOT] of var PROV: assign;

% H_PROVIDER_ACTIVE + H_PROVIDER_AVAILABLE
constraint forall(s in SLOT)(avail[assign[s], slot_day[s]]);
% H_CALL_ELIGIBLE_FOR_FIRST + H_CALL_ELIGIBLE_FOR_SECOND_LAST
constraint forall(s in SLOT where slot_req_call[s])(call_elig[assign[s]]);
% H_EYE_ELIGIBILITY / H_DENTAL_ELIGIBILITY
constraint forall(s in SLOT where slot_eye[s])(eye_elig[assign[s]]);
constraint forall(s in SLOT where slot_dental[s])(dental_elig[assign[s]]);
% H_NON_CALL_NO_WEEKEND_OR_HOLIDAY
constraint forall(s in SLOT where day_weekend[slot_day[s]] \/ day_holiday[slot_day[s]])(call_elig[assign[s]]);
% H_PROVIDER_ONE_SLOT_PER_DAY
constraint forall(d in DAY)(alldifferent([assign[s] | s in SLOT where slot_day[s] == d]));

% works[p,d]: provider has any slot on day d
array[PROV, DAY] of var bool: works;
constraint forall(p in PROV, d in DAY)(works[p, d] <-> exists(s in SLOT where slot_day[s] == d)(assign[s] == p));

% callv[p,d]: provider has derived call on day d. Parameter guard keeps assign[0] from ever appearing.
array[PROV, DAY] of var bool: callv;
constraint forall(p in PROV, d in DAY)(
  if day_call_required[d] /\ first_slot_of_day[d] > 0
  then callv[p, d] <-> (assign[first_slot_of_day[d]] == p)
  else callv[p, d] == false
  endif
);
% H_NO_CONSECUTIVE_CALLS
constraint forall(p in PROV, d in 1..D - 1)(callv[p, d] + callv[p, d + 1] <= 1);
% H_POST_CALL_DAY_OFF
constraint forall(p in PROV, d in 1..D - 1)(callv[p, d] -> not works[p, d + 1]);

% H_WEEKEND_BLOCK_SPLIT
array[PROV, BLK] of var bool: blk_call;
constraint forall(p in PROV, b in BLK)(blk_call[p, b] <-> exists(d in DAY where block_day[b, d])(callv[p, d]));
constraint forall(b in BLK where block_split[b])(sum(p in PROV)(blk_call[p, b]) == block_required[b]);

% --- soft tiers (x100 burdens match scaled targets). Explicit finite bounds are required: CP-SAT
% returns UNKNOWN on an unbounded objective domain. TOTCALL bounds any single provider's burden. ---
int: TOTCALL = sum(d in DAY)(call_weight[d]);
array[PROV] of var 0..TOTCALL: burden_call = [sum(d in DAY)(call_weight[d] * callv[p, d]) | p in PROV];
array[PROV] of var 0..TOTCALL: burden_weekend = [sum(d in DAY where day_weekend[d])(call_weight[d] * callv[p, d]) | p in PROV];
array[PROV] of var 0..TOTCALL: burden_holiday = [sum(d in DAY where day_holiday[d])(call_weight[d] * callv[p, d]) | p in PROV];
array[PROV] of var 0..S: cnt_first = [sum(s in SLOT where slot_is_first[s])(bool2int(assign[s] == p)) | p in PROV];
array[PROV] of var 0..S: cnt_second = [sum(s in SLOT where slot_is_second[s])(bool2int(assign[s] == p)) | p in PROV];
array[PROV] of var 0..S: cnt_middle = [sum(s in SLOT where slot_is_middle[s])(bool2int(assign[s] == p)) | p in PROV];
array[PROV] of var 0..S: cnt_last = [sum(s in SLOT where slot_is_last[s])(bool2int(assign[s] == p)) | p in PROV];
array[PROV] of var 0..S: cnt_eye = [sum(s in SLOT where slot_eye[s])(bool2int(assign[s] == p)) | p in PROV];
array[PROV] of var 0..S: cnt_dental = [sum(s in SLOT where slot_dental[s])(bool2int(assign[s] == p)) | p in PROV];
array[PROV] of var 0..D: cnt_workday = [sum(d in DAY)(bool2int(works[p, d])) | p in PROV];

var int: pen_callfair =
  sum(p in PROV)(abs(burden_call[p] - target_call[p]) + abs(burden_weekend[p] - target_weekend[p]) + abs(burden_holiday[p] - target_holiday[p]));
var int: pen_posfair =
  sum(p in PROV)(
    weight_first * abs(cnt_first[p] - target_first[p]) +
    weight_second * abs(cnt_second[p] - target_second[p]) +
    weight_middle * abs(cnt_middle[p] - target_middle[p]) +
    weight_last * abs(cnt_last[p] - target_last[p]) +
    weight_eye * abs(cnt_eye[p] - target_eye[p]) +
    weight_dental * abs(cnt_dental[p] - target_dental[p])
  );
var int: pen_workfair = sum(p in PROV)(abs(cnt_workday[p] - target_workday[p]));

% S_AVOID_WORK_CLUSTERS + S_AVOID_WEEKEND_CLUSTERS
array[PROV, BLK] of var bool: blk_work;
constraint forall(p in PROV, b in BLK)(blk_work[p, b] <-> exists(d in DAY where block_day[b, d])(works[p, d]));
var int: pen_cluster =
  sum(p in PROV, d in 1..D - 1)(bool2int(works[p, d] /\ works[p, d + 1])) + sum(p in PROV, b in 1..B - 1)(bool2int(blk_work[p, b] /\ blk_work[p, b + 1]));

% Tier weights 1000/100/10/1 encode spec hierarchy: rest/clusters > call/weekend/holiday fairness > position/special fairness > general workday imbalance.
var int: objective = 1000 * pen_cluster + 100 * pen_callfair + 10 * pen_posfair + 1 * pen_workfair;
solve minimize objective;
