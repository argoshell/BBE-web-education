// Generates regression fixtures from Randall Beer's original C++ code.
// Built with emscripten and run under node (see scripts/build-fixtures.mjs).
// Output: one JSON document on stdout.

#include "CTRNN.h"
#include "LeggedAgent.h"
#include "TSearch.h"
#include "random.h"
#include <cstdio>
#include <sstream>
#include <string>
#include <vector>

using namespace std;

// ---------- JSON helpers ----------

static bool firstField = true;

static void key(const char *k) {
  printf("%s\n\"%s\": ", firstField ? "" : ",", k);
  firstField = false;
}
static void num(double x) { printf("%.17g", x); }
static void arr(const vector<double> &v) {
  printf("[");
  for (size_t i = 0; i < v.size(); i++) { if (i) printf(","); num(v[i]); }
  printf("]");
}

// ---------- Walker evaluation used for search fixtures ----------
// Genome layout for an N-neuron "general" (Step) walker:
//   taus[N], biases[N], weights[N*N] (row-major, from i to j); gains fixed at 1.
// Must match src/sim/agents/legged/genome.ts.

const int WalkN = 3;
const double WalkDuration = 220, WalkStep = 0.1;

static void decodeWalker(TVector<double> &v, CTRNN &c) {
  int k = 1;
  for (int i = 1; i <= WalkN; i++) c.SetNeuronTimeConstant(i, MapSearchParameter(v[k++], 0.5, 10));
  for (int i = 1; i <= WalkN; i++) c.SetNeuronBias(i, MapSearchParameter(v[k++], -16, 16));
  for (int i = 1; i <= WalkN; i++)
    for (int j = 1; j <= WalkN; j++) c.SetConnectionWeight(i, j, MapSearchParameter(v[k++], -16, 16));
}

static double EvaluateWalker(TVector<double> &v, RandomState &rs) {
  LeggedAgent a;
  a.NervousSystem.SetCircuitSize(WalkN);
  decodeWalker(v, a.NervousSystem);
  a.Reset(0, 0, 0, rs);
  for (double t = 0; t < WalkDuration; t += WalkStep) a.Step(WalkStep);
  return a.cx / WalkDuration;
}

static double EvaluateQuadratic(TVector<double> &v, RandomState &) {
  double p1 = MapSearchParameter(v[1], -10, 10), p2 = MapSearchParameter(v[2], -10, 10);
  return 200 - (p1 * p1 + p2 * p2);
}

// ---------- Search fixture ----------

static vector<double> genBest, genAvg, genVar;
static void RecordStats(int, double best, double avg, double var) {
  genBest.push_back(best); genAvg.push_back(avg); genVar.push_back(var);
}

static void searchFixture(const char *name, int vsize, double (*fn)(TVector<double> &, RandomState &),
                          TReproductionMode mode, int pop, int gens, double mutvar,
                          double elite, int reeval, TSelectionMode sel) {
  genBest.clear(); genAvg.clear(); genVar.clear();
  TSearch s(vsize);
  s.SetRandomSeed(87632455);
  s.SetEvaluationFunction(fn);
  s.SetPopulationStatisticsDisplayFunction(RecordStats);
  s.SetSelectionMode(sel);
  s.SetReproductionMode(mode);
  s.SetPopulationSize(pop);
  s.SetMaxGenerations(gens);
  s.SetMutationVariance(mutvar);
  s.SetCrossoverProbability(0.0);
  s.SetMaxExpectedOffspring(1.1);
  s.SetElitistFraction(elite);
  s.SetSearchConstraint(1);
  s.SetReEvaluationFlag(reeval);
  s.ExecuteSearch();
  key(name);
  printf("{\"vectorSize\":%d,\"mode\":\"%s\",\"selection\":\"%s\",\"pop\":%d,\"gens\":%d,", vsize,
         mode == HILL_CLIMBING ? "hill" : "ga", sel == RANK_BASED ? "rank" : "fitprop", pop, gens);
  printf("\"mutationVariance\":"); num(mutvar);
  printf(",\"elite\":"); num(elite);
  printf(",\"reeval\":%d,\"best\":", reeval); arr(genBest);
  printf(",\"avg\":"); arr(genAvg);
  printf(",\"var\":"); arr(genVar);
  TVector<double> &b = s.BestIndividual();
  vector<double> bv;
  for (int i = 1; i <= b.Size(); i++) bv.push_back(b[i]);
  printf(",\"bestVector\":"); arr(bv);
  printf(",\"bestPerf\":"); num(s.BestPerformance());
  printf("}");
}

// ---------- Walker trajectory fixture ----------

enum StepKind { GENERAL, TWO, ONE, PERFECT };

static void walkerFixture(const char *name, LeggedAgent &a, StepKind kind, int randomize, long seed,
                          double duration, double dt) {
  RandomState rs(seed);
  a.Reset(0, 0, randomize, rs);
  vector<double> cx, vx, angle, omega, foot, ff, bf, footX, jointX;
  int n = a.NervousSystem.CircuitSize();
  vector<vector<double> > outs(n), states(n);
  int steps = 0;
  for (double t = 0; t < duration; t += dt) {
    switch (kind) {
      case GENERAL: a.Step(dt); break;
      case TWO: a.Step2(dt); break;
      case ONE: a.Step1(dt); break;
      case PERFECT: a.PerfectStep(dt); break;
    }
    steps++;
    cx.push_back(a.cx); vx.push_back(a.vx); angle.push_back(a.Leg.Angle); omega.push_back(a.Leg.Omega);
    foot.push_back(a.Leg.FootState); ff.push_back(a.Leg.ForwardForce); bf.push_back(a.Leg.BackwardForce);
    footX.push_back(a.Leg.FootX); jointX.push_back(a.Leg.JointX);
    for (int i = 0; i < n; i++) {
      outs[i].push_back(a.NervousSystem.NeuronOutput(i + 1));
      states[i].push_back(a.NervousSystem.NeuronState(i + 1));
    }
  }
  key(name);
  printf("{\"steps\":%d,\"randomize\":%d,\"seed\":%ld,\"duration\":", steps, randomize, seed);
  num(duration); printf(",\"dt\":"); num(dt);
  printf(",\"avgVelocity\":"); num(a.cx / duration);
  printf(",\"cx\":"); arr(cx); printf(",\"vx\":"); arr(vx);
  printf(",\"angle\":"); arr(angle); printf(",\"omega\":"); arr(omega);
  printf(",\"footState\":"); arr(foot); printf(",\"forwardForce\":"); arr(ff);
  printf(",\"backwardForce\":"); arr(bf); printf(",\"footX\":"); arr(footX);
  printf(",\"jointX\":"); arr(jointX);
  printf(",\"outputs\":["); for (int i = 0; i < n; i++) { if (i) printf(","); arr(outs[i]); } printf("]");
  printf(",\"states\":["); for (int i = 0; i < n; i++) { if (i) printf(","); arr(states[i]); } printf("]");
  printf("}");
}

static void circuitJson(CTRNN &c) {
  int n = c.CircuitSize();
  vector<double> taus, biases, gains, w;
  for (int i = 1; i <= n; i++) { taus.push_back(c.NeuronTimeConstant(i)); biases.push_back(c.NeuronBias(i)); gains.push_back(c.NeuronGain(i)); }
  for (int i = 1; i <= n; i++) for (int j = 1; j <= n; j++) w.push_back(c.ConnectionWeight(i, j));
  printf("{\"size\":%d,\"taus\":", n); arr(taus);
  printf(",\"biases\":"); arr(biases); printf(",\"gains\":"); arr(gains);
  printf(",\"weights\":"); arr(w); printf("}");
}

static void randomCircuit(CTRNN &c, int n, RandomState &rs) {
  c.SetCircuitSize(n);
  for (int i = 1; i <= n; i++) {
    c.SetNeuronTimeConstant(i, rs.UniformRandom(0.5, 10));
    c.SetNeuronBias(i, rs.UniformRandom(-16, 16));
    for (int j = 1; j <= n; j++) c.SetConnectionWeight(i, j, rs.UniformRandom(-16, 16));
  }
}

int main() {
  printf("{");

  // ---- RandomState ----
  {
    long seeds[] = {0, 1, 42, 87632455, 2147483646};
    key("random");
    printf("[");
    for (int s = 0; s < 5; s++) {
      RandomState rs(seeds[s]);
      vector<double> u, g, ints;
      for (int i = 0; i < 50; i++) u.push_back(rs.ran1());
      for (int i = 0; i < 20; i++) g.push_back(rs.GaussianRandom(0, 1));
      for (int i = 0; i < 20; i++) ints.push_back(rs.UniformRandomInteger(1, 2147483647));
      vector<double> pc;
      for (int i = 0; i < 20; i++) pc.push_back(rs.ProbabilisticChoice(0.3));
      TVector<double> uv(1, 7);
      rs.RandomUnitVector(uv);
      vector<double> uvv; for (int i = 1; i <= 7; i++) uvv.push_back(uv[i]);
      printf("%s{\"seed\":%ld,\"ran1\":", s ? "," : "", seeds[s]); arr(u);
      printf(",\"gaussian\":"); arr(g); printf(",\"uniformInt\":"); arr(ints);
      printf(",\"probChoice\":"); arr(pc); printf(",\"unitVector\":"); arr(uvv); printf("}");
    }
    printf("]");
  }

  // ---- CTRNN (SimpleCTRNNMain circuit), Euler and RK4 ----
  for (int method = 0; method < 2; method++) {
    CTRNN c(2);
    c.SetNeuronBias(1, -2.75); c.SetNeuronBias(2, -1.75);
    c.SetConnectionWeight(1, 1, 4.5); c.SetConnectionWeight(1, 2, -1);
    c.SetConnectionWeight(2, 1, 1); c.SetConnectionWeight(2, 2, 4.5);
    RandomState rs(1);
    c.RandomizeCircuitState(-0.5, 0.5, rs);
    vector<double> o1, o2, y1, y2;
    o1.push_back(c.NeuronOutput(1)); o2.push_back(c.NeuronOutput(2));
    y1.push_back(c.NeuronState(1)); y2.push_back(c.NeuronState(2));
    for (int i = 0; i < 2500; i++) {
      if (method == 0) c.EulerStep(0.01); else c.RK4Step(0.01);
      o1.push_back(c.NeuronOutput(1)); o2.push_back(c.NeuronOutput(2));
      y1.push_back(c.NeuronState(1)); y2.push_back(c.NeuronState(2));
    }
    key(method == 0 ? "ctrnnEuler" : "ctrnnRK4");
    printf("{\"stepSize\":0.01,\"seed\":1,\"o1\":"); arr(o1);
    printf(",\"o2\":"); arr(o2); printf(",\"y1\":"); arr(y1); printf(",\"y2\":"); arr(y2); printf("}");
  }

  // ---- Walkers ----
  {
    // Beer's evolved 5-neuron CPG walker (cpg.ns uses classic Mac CR line endings)
    LeggedAgent a;
    ifstream ifs("cpg.ns");
    ifs >> a.NervousSystem;
    key("cpgCircuit"); circuitJson(a.NervousSystem);
    walkerFixture("walkerCpg", a, GENERAL, 0, 1, 200, 0.1);
    walkerFixture("walkerCpgRandomized", a, GENERAL, 1, 7, 200, 0.1);
  }
  {
    RandomState crs(12345);
    LeggedAgent a2; randomCircuit(a2.NervousSystem, 2, crs);
    key("twoCircuit"); circuitJson(a2.NervousSystem);
    walkerFixture("walkerTwo", a2, TWO, 0, 1, 200, 0.1);
    LeggedAgent a1; randomCircuit(a1.NervousSystem, 1, crs);
    key("oneCircuit"); circuitJson(a1.NervousSystem);
    walkerFixture("walkerOne", a1, ONE, 0, 1, 200, 0.1);
    LeggedAgent ap; ap.NervousSystem.SetCircuitSize(1);
    walkerFixture("walkerPerfect", ap, PERFECT, 0, 1, 200, 0.1);
  }

  // ---- Search ----
  searchFixture("searchQuadHill", 2, EvaluateQuadratic, HILL_CLIMBING, 50, 30, 0.1, 0.0, 0, RANK_BASED);
  searchFixture("searchQuadGA", 2, EvaluateQuadratic, GENETIC_ALGORITHM, 50, 30, 0.1, 0.1, 0, RANK_BASED);
  searchFixture("searchQuadGAFitProp", 2, EvaluateQuadratic, GENETIC_ALGORITHM, 50, 30, 0.1, 0.04, 0, FITNESS_PROPORTIONATE);
  searchFixture("searchWalkerGA", WalkN * (WalkN + 2), EvaluateWalker, GENETIC_ALGORITHM, 40, 25, 0.05, 0.05, 0, RANK_BASED);
  searchFixture("searchWalkerHillReEval", WalkN * (WalkN + 2), EvaluateWalker, HILL_CLIMBING, 30, 15, 0.05, 0.0, 1, RANK_BASED);

  printf("\n}\n");
  return 0;
}
