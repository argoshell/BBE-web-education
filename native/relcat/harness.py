"""Reference fixtures from Nathaniel Rodriguez's relcat (relational categorization; Williams, Beer & Gasser 2008).
Runs the original Python (fetched into reference/relcat, never committed) and writes tests/fixtures/relcat.json.
Run with native/relcat/run.sh (Docker, python:3.12-slim + numpy)."""
import json, sys
import numpy as np
sys.path.insert(0, '/work/reference/relcat')
import relcat as rc

task = rc.RelationalCategorization()
sym = rc.RelationalCategorization(bilateral_symmetry=True)
rng = np.random.RandomState(12345)
out = {'params': {k: getattr(task, k) for k in ['world_left', 'world_right', 'world_top', 'world_bottom', 'agent_radius', 'mass',
       'visual_angle', 'num_rays', 'num_interneurons', 'max_distance', 'max_ray_length', 'max_velocity', 'obj_velocity',
       'circle_min_diameter', 'circle_max_diameter', 'circle_difference', 'step_size', 'num_parameters']},
       'symmetricNumParameters': sym.num_parameters}

def make_agent(t, x):
    agent = rc.SensorAgent(t.agent_radius, t.mass, t.visual_angle, t.num_rays, t.max_ray_length,
                           t.initial_agent_x, t.initial_agent_y, t.circuit_size, t.max_velocity)
    t.map_search_parameters(x, agent.nervous_system)
    return agent

def network(agent):
    ns = agent.nervous_system
    return {'sensorWeights': ns.sensor_weights.tolist(), 'weights': ns.circuit_weights.tolist(),
            'biases': ns.biases[:, 0].tolist(), 'gains': ns.gains[:, 0].tolist(), 'taus': ns.taus[:, 0].tolist()}

def traced_trial(t, agent, first, second):
    """Same as RelationalCategorization.trial, logging every step."""
    log = {'agentX': [], 'ballY': [], 'phase': [], 'sensors': [], 'outputs': [], 'states': []}
    orig_step = agent.step
    def step(step_size, locked):
        orig_step(step_size, locked)
        ns = agent.nervous_system
        log['agentX'].append(agent.xpos)
        log['phase'].append(1 if locked else 2)
        log['sensors'].append(ns.sensor_states[:, 0].tolist())
        log['outputs'].append(ns.ctrnn_outputs[:, 0].tolist())
        log['states'].append(ns.ctrnn_states[:, 0].tolist())
    agent.step = step
    ball = rc.Circle(t.circle_size, t.initial_agent_x, t.world_top, 0.0, t.obj_velocity)
    orig_ball_step = ball.step
    def bstep(dt):
        orig_ball_step(dt)
        log['ballY'].append(ball.center_ypos)
    ball.step = bstep
    score = t.trial(agent, ball, first, second)
    agent.step = orig_step
    log['score'] = score
    log['first'] = first
    log['second'] = second
    return log

cases = []
for k in range(3):
    x = rng.uniform(-1, 1, size=task.num_parameters)
    agent = make_agent(task, x)
    case = {'x': x.tolist(), 'symmetric': False, 'network': network(agent),
            'trials': [traced_trial(task, agent, a, b) for a, b in [(40.0, 25.0), (25.0, 45.0)]],
            'fitness': -task(x)}
    cases.append(case)
    print('case', k, 'fitness', case['fitness'], flush=True)
xs = rng.uniform(-1, 1, size=sym.num_parameters)
agent = make_agent(sym, xs)
cases.append({'x': xs.tolist(), 'symmetric': True, 'network': network(agent),
              'trials': [traced_trial(sym, agent, 30.0, 50.0)], 'fitness': -sym(xs)})
print('symmetric fitness', cases[-1]['fitness'], flush=True)
# Circuits evolved by the site (derived data), so the reference also covers agents that categorize
for pr in json.load(open('/work/src/sim/agents/relcat/evolvedPresets.json')):
    t = sym if pr['symmetric'] else task
    x = np.array(pr['genome'])
    agent = make_agent(t, x)
    cases.append({'x': x.tolist(), 'symmetric': pr['symmetric'], 'network': network(agent),
                  'trials': [traced_trial(t, agent, a, b) for a, b in [(45.0, 30.0), (30.0, 45.0)]], 'fitness': -t(x)})
    print('preset', pr['name'], 'fitness', cases[-1]['fitness'], flush=True)
out['cases'] = cases
json.dump(out, open('/work/tests/fixtures/relcat.json', 'w'))
print('wrote tests/fixtures/relcat.json')
