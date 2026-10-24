// Regression fixtures for Eduardo Izquierdo's C. elegans klinotaxis model
// (https://github.com/edizquierdo/CE_orientation: WormAgent.cpp, main.cpp).
// main.cpp is included with its main() renamed so GenPhenMapping and EvaluationFunction
// are the original code.
//
// WormAgent::pastTheta is never initialized in the original (its first use reads stack garbage).
// The harness sets it to 0 and replicates EvaluationFunction with that fix ("fitness"); the
// untouched EvaluationFunction result is reported as "fitnessMain" for comparison.

#define main izquierdo_main
#include "main.cpp"
#undef main

#include <cstdio>
#include <vector>

using namespace std;

static bool firstField = true;
static void key(const char *k) { printf("%s\n\"%s\": ", firstField ? "" : ",", k); firstField = false; }
static void num(double x) { printf("%.17g", x); }
static void arr(const vector<double> &v) {
  printf("[");
  for (size_t i = 0; i < v.size(); i++) { if (i) printf(","); num(v[i]); }
  printf("]");
}
static void tvec(TVector<double> &v) {
  vector<double> out;
  for (int i = v.LowerBound(); i <= v.UpperBound(); i++) out.push_back(v[i]);
  arr(out);
}

static void initWorm(WormAgent &w) {
  w.pastTheta = 0.0;
  w.avgvel = 0.0;
  w.avgtheta = 0.0;
  // Only read before the first UpdateSensors by the sample of the initial state
  w.oASEL = w.oASER = w.tempDiff = 0.0;
}

// EvaluationFunction from main.cpp with pastTheta initialized.
static double evaluateFixed(TVector<double> &v, RandomState &rs, int taxis, int kinesis) {
  TVector<double> phenotype;
  phenotype.SetBounds(1, VectSize);
  GenPhenMapping(v, phenotype);
  WormAgent Worm(CircuitSize);
  initWorm(Worm);
  Worm.SetParameters(phenotype);
  double f, accdist, totaldist;
  int k = 0;
  double fitness = 0.0;
  for (double gradSteep = 0.5; gradSteep <= 0.5; gradSteep += 0.2) {
    for (double orient = 0.0; orient < 2 * Pi; orient += Pi / 2) {
      Worm.InitialiseAgent(2 * RunDuration, StepSize);
      Worm.ResetAgentsBody(orient, rs);
      Worm.ResetChemCon(gradSteep);
      Worm.ResetAgentIntState(rs);
      Worm.UpdateChemCon(gradSteep);
      for (int repeats = 1; repeats <= 2; repeats++) {
        Worm.ResetAgentsBody(orient, rs);
        for (double t = StepSize; t <= TransientDuration; t += StepSize) {
          Worm.UpdateSensors();
          Worm.Step(StepSize, rs, t, taxis, kinesis);
          Worm.UpdateChemCon(gradSteep);
        }
        accdist = 0.0;
        for (double t = StepSize; t <= EvalDuration; t += StepSize) {
          Worm.UpdateSensors();
          Worm.Step(StepSize, rs, t, taxis, kinesis);
          Worm.UpdateChemCon(gradSteep);
          accdist += Worm.DistanceToCentre();
        }
        totaldist = (accdist / (EvalDuration / StepSize));
        f = (MaxDist - totaldist) / MaxDist;
        f = f < 0 ? 0.0 : f;
        fitness += f;
        k++;
      }
    }
  }
  return fitness / k;
}

static void dumpWorm(WormAgent &w) {
  int n = w.size;
  CTRNN &c = w.NervousSystem;
  vector<double> taus, biases, gains, wts, aser, asel;
  for (int i = 1; i <= n; i++) { taus.push_back(c.NeuronTimeConstant(i)); biases.push_back(c.NeuronBias(i)); gains.push_back(c.NeuronGain(i)); }
  for (int i = 1; i <= n; i++) for (int j = 1; j <= n; j++) wts.push_back(c.ConnectionWeight(i, j));
  for (int i = 1; i <= n; i++) { aser.push_back(w.w_ASER[i]); asel.push_back(w.w_ASEL[i]); }
  printf("{\"size\":%d,\"taus\":", n); arr(taus);
  printf(",\"biases\":"); arr(biases);
  printf(",\"gains\":"); arr(gains);
  printf(",\"weights\":"); arr(wts);
  printf(",\"wASER\":"); arr(aser);
  printf(",\"wASEL\":"); arr(asel);
  printf(",\"wCpgV\":"); num(w.w_CPG_SMBV);
  printf(",\"wCpgD\":"); num(w.w_CPG_SMBD);
  printf(",\"sensorN\":"); num(w.sensorN);
  printf(",\"sensorM\":"); num(w.sensorM);
  printf(",\"outputGain\":"); num(w.outputGain);
  printf("}");
}

struct Trace {
  vector<double> step, t, px, py, orient, chemCon, dist, on, off, theta, avgvel, avgtheta, forward;
  vector<vector<double> > outputs, states;
};

static void sample(Trace &tr, WormAgent &w, int step, double t) {
  int n = w.size;
  if (tr.outputs.empty()) { tr.outputs.resize(n); tr.states.resize(n); }
  tr.step.push_back(step); tr.t.push_back(t);
  tr.px.push_back(w.px); tr.py.push_back(w.py); tr.orient.push_back(w.orient);
  tr.chemCon.push_back(w.chemCon); tr.dist.push_back(w.distanceToCentre);
  tr.on.push_back(w.oASEL); tr.off.push_back(w.oASER);
  tr.theta.push_back(w.theta); tr.avgvel.push_back(w.avgvel); tr.avgtheta.push_back(w.avgtheta);
  tr.forward.push_back(w.forward);
  for (int i = 0; i < n; i++) { tr.outputs[i].push_back(w.NervousSystem.NeuronOutput(i + 1)); tr.states[i].push_back(w.NervousSystem.NeuronState(i + 1)); }
}

// One orientation of the EvaluationFunction protocol, sampled every step for the first `dense`
// steps and every `every` steps afterwards (step = global step count, 1-based).
static void trajectory(const char *name, const vector<double> &genomeV, double orient, double gradSteep, int repeats,
                       int taxis, int kinesis, long seed, int dense, int every) {
  TVector<double> genome(1, VectSize), phenotype(1, VectSize);
  for (int i = 1; i <= VectSize; i++) genome[i] = genomeV[i - 1];
  GenPhenMapping(genome, phenotype);
  WormAgent Worm(CircuitSize);
  initWorm(Worm);
  Worm.SetParameters(phenotype);
  RandomState rs(seed);
  Trace tr;
  vector<double> scores;
  Worm.InitialiseAgent(2 * RunDuration, StepSize);
  Worm.ResetAgentsBody(orient, rs);
  Worm.ResetChemCon(gradSteep);
  Worm.ResetAgentIntState(rs);
  Worm.UpdateChemCon(gradSteep);
  int step = 0;
  sample(tr, Worm, 0, 0);
  for (int r = 1; r <= repeats; r++) {
    Worm.ResetAgentsBody(orient, rs);
    for (double t = StepSize; t <= TransientDuration; t += StepSize) {
      Worm.UpdateSensors();
      Worm.Step(StepSize, rs, t, taxis, kinesis);
      Worm.UpdateChemCon(gradSteep);
      step++;
      if (step <= dense || step % every == 0) sample(tr, Worm, step, t);
    }
    double accdist = 0.0;
    for (double t = StepSize; t <= EvalDuration; t += StepSize) {
      Worm.UpdateSensors();
      Worm.Step(StepSize, rs, t, taxis, kinesis);
      Worm.UpdateChemCon(gradSteep);
      accdist += Worm.DistanceToCentre();
      step++;
      if (step <= dense || step % every == 0) sample(tr, Worm, step, t);
    }
    double f = (MaxDist - accdist / (EvalDuration / StepSize)) / MaxDist;
    scores.push_back(f < 0 ? 0.0 : f);
  }
  key(name);
  printf("{\"initialOrient\":"); num(orient);
  printf(",\"gradSteep\":"); num(gradSteep);
  printf(",\"repeats\":%d,\"taxis\":%d,\"kinesis\":%d,\"seed\":%ld,\"totalSteps\":%d", repeats, taxis, kinesis, seed, step);
  printf(",\"scores\":"); arr(scores);
  printf(",\"finalTimer\":%d", Worm.timer);
  printf(",\"step\":"); arr(tr.step);
  printf(",\"t\":"); arr(tr.t);
  printf(",\"px\":"); arr(tr.px);
  printf(",\"py\":"); arr(tr.py);
  printf(",\"orient\":"); arr(tr.orient);
  printf(",\"chemCon\":"); arr(tr.chemCon);
  printf(",\"dist\":"); arr(tr.dist);
  printf(",\"on\":"); arr(tr.on);
  printf(",\"off\":"); arr(tr.off);
  printf(",\"theta\":"); arr(tr.theta);
  printf(",\"avgvel\":"); arr(tr.avgvel);
  printf(",\"avgtheta\":"); arr(tr.avgtheta);
  printf(",\"forward\":"); arr(tr.forward);
  printf(",\"outputs\":["); for (size_t i = 0; i < tr.outputs.size(); i++) { if (i) printf(","); arr(tr.outputs[i]); } printf("]");
  printf(",\"states\":["); for (size_t i = 0; i < tr.states.size(); i++) { if (i) printf(","); arr(tr.states[i]); } printf("]");
  printf("}");
}

// Genomes evolved by this project's TS port (derived data, see src/sim/agents/chemotaxis/evolvedPresets.json),
// so the C++ is also checked on circuits that actually perform klinotaxis.
#include "chemotaxis_genomes.inc"

int main() {
  printf("{");
  key("constants");
  printf("{\"VectSize\":%d,\"CircuitSize\":%d,\"VelDelta\":%d,\"HSP\":", VectSize, CircuitSize, VelDelta); num(HSP);
  printf(",\"ChemDiffConst\":"); num(ChemDiffConst);
  printf("}");

  // Random genomes plus the evolved ones
  vector<vector<double> > genomes;
  vector<long> seeds;
  const long randomSeeds[] = {1, 7, 42};
  for (long s : randomSeeds) {
    RandomState rs(s);
    vector<double> g(VectSize);
    for (int i = 0; i < VectSize; i++) g[i] = rs.UniformRandom(-1, 1);
    genomes.push_back(g);
    seeds.push_back(s);
  }
  for (int k = 0; k < NumEvolvedGenomes; k++) {
    genomes.push_back(vector<double>(EvolvedGenomes[k], EvolvedGenomes[k] + VectSize));
    seeds.push_back(0);
  }

  key("genomes");
  printf("[");
  for (size_t k = 0; k < genomes.size(); k++) {
    if (k) printf(",");
    TVector<double> g(1, VectSize);
    for (int i = 1; i <= VectSize; i++) g[i] = genomes[k][i - 1];
    TVector<double> phen(1, VectSize);
    GenPhenMapping(g, phen);
    WormAgent w(CircuitSize);
    w.SetParameters(phen);
    RandomState rs1(seeds[k] + 100), rs2(seeds[k] + 100), rs3(seeds[k] + 100);
    double fixed = evaluateFixed(g, rs1, 1, 0);
    double orig = EvaluationFunction(g, rs2);
    double kin = evaluateFixed(g, rs3, 0, 1);
    printf("\n{\"seed\":%ld,\"genome\":", seeds[k]); tvec(g);
    printf(",\"phenotype\":"); tvec(phen);
    printf(",\"worm\":"); dumpWorm(w);
    printf(",\"fitness\":"); num(fixed);
    printf(",\"fitnessMain\":"); num(orig);
    printf(",\"fitnessKinesis\":"); num(kin);
    printf("}");
  }
  printf("]");

  trajectory("taxis0", genomes[0], 0.0, 0.5, 2, 1, 0, 3, 400, 50);
  trajectory("taxis1", genomes[1], Pi / 2, 0.5, 1, 1, 0, 3, 200, 100);
  trajectory("taxis2", genomes[2], Pi, 0.8, 1, 1, 0, 3, 200, 100);
  trajectory("kinesis0", genomes[0], 0.0, 0.5, 1, 0, 1, 5, 200, 100);
  trajectory("kinesis1", genomes[1], 3 * Pi / 2, 0.3, 1, 0, 1, 11, 200, 100);
  for (int k = 0; k < NumEvolvedGenomes; k++) {
    char name[32];
    snprintf(name, sizeof name, "evolved%d", k);
    trajectory(name, genomes[3 + k], Pi / 2, 0.5, 2, 1, 0, 1, 200, 50);
  }
  printf("\n}\n");
  return 0;
}
