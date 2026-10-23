// Regression fixtures for Eduardo Izquierdo's VisuallyGuidedAgent (with Randall Beer and Matthew
// Setzler): object-size discrimination (circles) and perceiving affordances (apertures between two
// falling lines). Built against reference/visually-guided-agent (fetched by
// scripts/fetch-izquierdo-visual.mjs, never committed).
//
// main.cpp is included with its main() renamed so the original GenPhenMapping and fitness functions
// (CircleSizeCategorization, PerceiveAffordance, MultipleTasks) are exercised directly.

#define main izquierdo_main
#include "main.cpp"
#undef main

#include <cstdio>
#include <vector>

static bool firstField = true;
static void key(const char *k) { printf("%s\n\"%s\": ", firstField ? "" : ",", k); firstField = false; }
static void num(double x) { printf("%.17g", x); }
static void arr(const vector<double> &v) {
  printf("[");
  for (size_t i = 0; i < v.size(); i++) { if (i) printf(","); num(v[i]); }
  printf("]");
}

static RandomState stepRs(1);  // unused by Step (its noise lines are commented out)

// One trial exactly as in CircleSizeCategorization / PerceiveAffordance, recording every step.
// task 0: circle of diameter `size` at x = pos; task 1: aperture of width `size` centered at pos.
static void trial(VisualAgent &Agent, int task, double pos, double size) {
  vector<double> ax, oy, inputs;
  vector<vector<double> > outs(CIRCUITSIZE);
  int steps = 0;
  Agent.Reset(0, 0, 0);
  Agent.SetPositionX(0);
  Circle Object(0.0, STARTHEIGHT, -3, 0.0, OBJECTHEIGHT);
  Line ObjectLeft(0.0, STARTHEIGHT, -3, 0.0, OBJECTHEIGHT);
  Line ObjectRight(0.0, STARTHEIGHT, -3, 0.0, OBJECTHEIGHT);
  if (task == 0) {
    Object.SetPositionY(STARTHEIGHT);
    Object.SetPositionX(pos);
    Object.SetSize(size);
  } else {
    ObjectRight.SetPositionX((size / 2) + (OBJECTHEIGHT / 2.0) + pos);
    ObjectLeft.SetPositionX((-(size / 2) - (OBJECTHEIGHT / 2.0)) + pos);
    ObjectRight.SetPositionY(STARTHEIGHT);
    ObjectLeft.SetPositionY(STARTHEIGHT);
  }
  VisualObject &lead = task == 0 ? (VisualObject &)Object : (VisualObject &)ObjectLeft;
  for (double t = 0; lead.PositionY() > BodySize; t += StepSize) {
    if (task == 0) {
      Agent.Step(stepRs, StepSize, Object);
      Object.Step(StepSize);
    } else {
      Agent.Step2(stepRs, StepSize, ObjectLeft, ObjectRight);
      ObjectLeft.Step(StepSize);
      ObjectRight.Step(StepSize);
    }
    steps++;
    ax.push_back(Agent.PositionX());
    oy.push_back(lead.PositionY());
    for (int i = 1; i <= NUMRAYS; i++) inputs.push_back(Agent.ExternalInput[i]);
    for (int i = 0; i < CIRCUITSIZE; i++) outs[i].push_back(Agent.NervousSystem.NeuronOutput(i + 1));
  }
  double d = fabs(Agent.PositionX() - pos);
  printf("{\"task\":\"%s\",\"pos\":", task == 0 ? "size" : "aperture"); num(pos);
  printf(",\"size\":"); num(size);
  printf(",\"steps\":%d,\"agentX\":", steps); arr(ax);
  printf(",\"objectY\":"); arr(oy);
  printf(",\"inputs\":"); arr(inputs);
  printf(",\"outputs\":["); for (int i = 0; i < CIRCUITSIZE; i++) { if (i) printf(","); arr(outs[i]); } printf("]");
  printf(",\"finalDistance\":"); num(d);
  printf("}");
}

int main() {
  printf("{");
  key("vectSize"); printf("%d", VectSize);
  // Fixed genomes drawn from seeded RandomStates (seeds chosen so that both agents move)
  const long seeds[] = {12345, 3};
  key("genomes");
  printf("[");
  for (int g = 0; g < 2; g++) {
    if (g) printf(",");
    SetRandomSeed(0);
    RandomState gen(seeds[g]);
    TVector<double> v(1, VectSize), phen(1, VectSize);
    for (int i = 1; i <= VectSize; i++) v[i] = gen.UniformRandom(-1, 1);
    GenPhenMapping(v, phen);
    VisualAgent Agent(0.0, 0.0, NUMRAYS, NUMINTER, NUMMOTOR);
    Agent.SetController(phen);
    vector<double> gv, pv, taus, biases, gains, w, sw;
    for (int i = 1; i <= VectSize; i++) { gv.push_back(v[i]); pv.push_back(phen[i]); }
    CTRNN &c = Agent.NervousSystem;
    for (int i = 1; i <= CIRCUITSIZE; i++) { taus.push_back(c.NeuronTimeConstant(i)); biases.push_back(c.NeuronBias(i)); gains.push_back(c.NeuronGain(i)); }
    for (int i = 1; i <= CIRCUITSIZE; i++) for (int j = 1; j <= CIRCUITSIZE; j++) w.push_back(c.ConnectionWeight(i, j));
    for (int i = 1; i <= NUMRAYS; i++) for (int j = 1; j <= NUMINTER; j++) sw.push_back(Agent.SensorWeight[i][j]);
    printf("\n{\"genome\":"); arr(gv);
    printf(",\"phenotype\":"); arr(pv);
    printf(",\"circuit\":{\"size\":%d,\"taus\":", CIRCUITSIZE); arr(taus);
    printf(",\"biases\":"); arr(biases); printf(",\"gains\":"); arr(gains);
    printf(",\"weights\":"); arr(w); printf("}");
    printf(",\"sensorWeights\":"); arr(sw);
    printf(",\"trials\":[");
    // (position, size) pairs from the fitness grid, two below and two above the body size
    const double cases[4][2] = {{2, 20}, {10, 26}, {24, 34}, {14, 40}};
    for (int task = 0; task < 2; task++)
      for (int k = 0; k < 4; k++) {
        if (task || k) printf(",");
        printf("\n");
        trial(Agent, task, cases[k][0], cases[k][1]);
      }
    printf("]");
    RandomState rs(1);
    printf(",\"fitness\":{\"size\":"); num(CircleSizeCategorization(v, rs));
    printf(",\"aperture\":"); num(PerceiveAffordance(v, rs));
    printf(",\"both\":"); num(MultipleTasks(v, rs));
    printf("}}");
  }
  printf("]\n}\n");
  return 0;
}
