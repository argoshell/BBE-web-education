(* Reference results from Randall Beer's Dynamica package (Mathematica / Wolfram Engine).
   Run with native/dynamica/run.sh; writes tests/fixtures/dynamica.json.
   Dynamica.m itself is fetched into reference/dynamica (no license; not redistributed). *)

Get["/work/reference/dynamica/Dynamica.m"];
sig[x_] := 1/(1 + Exp[-x]);

(* CTRNN vector field: tau_i dy_i/dt = -y_i + sum_j w[j,i] sig(g_j (y_j + theta_j)) + I_i,
   with w given row-major by source neuron as in the site's CTRNNParams. *)
ctrnnFns[taus_, biases_, gains_, w_, inputs_, ys_] := Module[{n = Length[taus]},
  Table[(-ys[[i]] + Sum[w[[(j - 1) n + i]] sig[gains[[j]] (ys[[j]] + biases[[j]])], {j, n}] + inputs[[i]])/taus[[i]], {i, n}]];

cpx[z_] := {N[Re[z]], N[Im[z]]};
ep2json[ep_] := <|"point" -> N[LSPoint[ep]], "stability" -> ToString[LSStability[ep]],
  "type" -> ToString[EPType[ep]], "eigenvalues" -> cpx /@ EPEigenvalues[ep]|>;
lc2json[lc_LimitSet] := <|"point" -> N[LSPoint[lc]], "stability" -> ToString[LSStability[lc]],
  "period" -> N[LCPeriod[lc]], "multipliers" -> cpx /@ LCFloquetMultipliers[lc]|>;
lc2json[_] := Null;

(* Settle onto the attractor by simulation, then hand the end state to FindLimitCycle *)
settle[fns_, ys_, y0_, T_] := Module[{sol, t},
  sol = NDSolve[Join[Thread[(D[#[t], t] & /@ ys) == (fns /. Thread[ys -> (#[t] & /@ ys)])], Thread[(#[0] & /@ ys) == y0]], ys, {t, 0, T}, MaxSteps -> 10^6];
  (#[T] & /@ ys) /. First[sol]];

branches2json[{ebs_, bps_}] := <|
  "branches" -> (<|"stability" -> ToString[#[[2]]], "points" -> N[#[[4]]]|> & /@ ebs),
  "bifurcations" -> (<|"type" -> ToString[#[[2]]], "point" -> N[#[[3]]], "parameters" -> N[Values[#[[1, 9]]]]|> & /@ bps)|>;

results = <||>;

(* 1. SimpleCTRNNMain oscillator *)
oscW = {4.5, -1, 1, 4.5};
fOsc = ctrnnFns[{1, 1}, {-2.75, -1.75}, {1, 1}, oscW, {0, 0}, {y1, y2}];
dsOsc = DynamicalSystem[fOsc, {{y1, -10, 10}, {y2, -10, 10}}];
yOsc = settle[fOsc, {y1, y2}, {0.1, -0.2}, 300];
results["oscillator"] = <|"circuit" -> <|"taus" -> {1, 1}, "biases" -> {-2.75, -1.75}, "gains" -> {1, 1}, "weights" -> oscW|>,
  "equilibria" -> ep2json /@ EquilibriumPoints[dsOsc],
  "cycleStart" -> N[yOsc],
  "limitCycle" -> lc2json[FindLimitCycle[dsOsc, yOsc, 29]]|>;

(* 2. Equilibrium branches of the oscillator over theta_1: two Hopf bifurcations *)
dsOscP = DynamicalSystem[ctrnnFns[{1, 1}, {th1, -1.75}, {1, 1}, oscW, {0, 0}, {y1, y2}], {{y1, -12, 12}, {y2, -12, 12}}, {{th1, -8, 4}}];
results["oscillatorBranches"] = branches2json[EquilibriumBranches[dsOscP, th1]];

(* 3. Self-exciting neuron over its input: two folds bounding bistability *)
dsSelf = DynamicalSystem[{-y + 8 sig[y - 4] + in}, {{y, -10, 20}}, {{in, -3, 3}}];
results["selfExcitingBranches"] = branches2json[EquilibriumBranches[dsSelf, in]];

(* 4. A bistable 2-neuron circuit (strong self-excitation, mutual inhibition): saddle plus two stable nodes *)
bW = {6, -3, -3, 6};
dsBi = DynamicalSystem[ctrnnFns[{1, 1}, {-1.5, -1.5}, {1, 1}, bW, {0, 0}, {y1, y2}], {{y1, -10, 10}, {y2, -10, 10}}];
results["bistable"] = <|"circuit" -> <|"taus" -> {1, 1}, "biases" -> {-1.5, -1.5}, "gains" -> {1, 1}, "weights" -> bW|>,
  "equilibria" -> ep2json /@ EquilibriumPoints[dsBi]|>;

(* 5. Beer's 5-neuron cpg.ns walker circuit (no sensory input): the walking rhythm is a limit cycle *)
cpgT = {6.196245, 2.515073, 8.67099, 9.918356, 9.252712};
cpgB = {14.589926, 10.762988, -3.919602, 9.76748, -2.826332};
cpgW = {-15.800203, 15.311454, -8.851767, -10.042705, -10.913972, 9.944963, -6.748288, 11.78331, -9.133361, 15.878405,
  -12.175295, -13.495099, 8.688801, 7.616306, 11.278046, -0.425391, -2.001676, -14.620253, 6.691054, -11.390638,
  -4.839062, -11.4249, 11.858115, 0.49043, -6.396606};
yc = {c1, c2, c3, c4, c5};
fCpg = ctrnnFns[cpgT, cpgB, {1, 1, 1, 1, 1}, cpgW, {0, 0, 0, 0, 0}, yc];
dsCpg = DynamicalSystem[fCpg, Table[{yc[[i]], -40, 40}, {i, 5}]];
yCpg = settle[fCpg, yc, {0, 0, 0, 0, 0}, 400];
results["cpg"] = <|"circuit" -> <|"taus" -> cpgT, "biases" -> cpgB, "gains" -> {1, 1, 1, 1, 1}, "weights" -> cpgW|>,
  "equilibria" -> ep2json /@ EquilibriumPoints[dsCpg],
  "cycleStart" -> N[yCpg],
  "limitCycle" -> lc2json[FindLimitCycle[dsCpg, yCpg, 44]]|>;

Export["/work/tests/fixtures/dynamica.json", results, "RawJSON"];
Print["wrote tests/fixtures/dynamica.json with keys: ", Keys[results]];
