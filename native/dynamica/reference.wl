(* Reference results from Randall Beer's Dynamica package (Mathematica / Wolfram Engine).
   Run with native/dynamica/run.sh; writes tests/fixtures/dynamica.json.
   Dynamica.m itself is fetched into reference/dynamica (no license; not redistributed). *)

Get["/work/reference/dynamica/Dynamica.m"];
sig[x_] := 1/(1 + Exp[-x]);

(* CTRNN vector field: tau_i dy_i/dt = -y_i + sum_j w[j,i] sig(g_j (y_j + theta_j)) + I_i,
   with w given row-major by source neuron as in the site's CTRNNParams. *)
ctrnnFns[taus_, biases_, gains_, w_, inputs_, ys_] := Module[{n = Length[taus]},
  Table[(-ys[[i]] + Sum[w[[(j - 1) n + i]] sig[gains[[j]] (ys[[j]] + biases[[j]])], {j, n}] + inputs[[i]])/taus[[i]], {i, n}]];

cpx[z_] := {Re[z], Im[z]};
ep2json[ep_] := <|"point" -> N[LSPoint[ep]], "stability" -> ToString[LSStability[ep]],
  "type" -> ToString[EPType[ep]], "eigenvalues" -> cpx /@ N[EPEigenvalues[ep]]|>;
lc2json[lc_] := <|"point" -> N[LSPoint[lc]], "stability" -> ToString[LSStability[lc]],
  "period" -> N[LCPeriod[lc]], "multipliers" -> cpx /@ N[LCFloquetMultipliers[lc]]|>;

results = <||>;

(* 1. SimpleCTRNNMain oscillator: equilibria and limit cycle *)
osc = {"taus" -> {1, 1}, "biases" -> {-2.75, -1.75}, "gains" -> {1, 1}, "weights" -> {4.5, -1, 1, 4.5}};
dsOsc = DynamicalSystem[ctrnnFns[{1, 1}, {-2.75, -1.75}, {1, 1}, {4.5, -1, 1, 4.5}, {0, 0}, {y1, y2}], {{y1, -10, 10}, {y2, -10, 10}}];
results["oscillator"] = <|"circuit" -> Association[osc],
  "equilibria" -> ep2json /@ EquilibriumPoints[dsOsc],
  "limitCycle" -> lc2json[FindLimitCycle[dsOsc, {0.1, -0.2}, 29]]|>;

(* 2. The same oscillator with theta_1 as a bifurcation parameter *)
dsOscP = DynamicalSystem[ctrnnFns[{1, 1}, {th1, -1.75}, {1, 1}, {4.5, -1, 1, 4.5}, {0, 0}, {y1, y2}],
  {{y1, -12, 12}, {y2, -12, 12}}, {{th1, -8, 4}}];
results["oscillatorBranches"] = ToString[EquilibriumBranches[dsOscP, th1], InputForm];

(* 3. Self-exciting neuron with input I as parameter: two folds *)
dsSelf = DynamicalSystem[{-y + 8 sig[y - 4] + in}, {{y, -10, 20}}, {{in, -3, 3}}];
results["selfExcitingBranches"] = ToString[EquilibriumBranches[dsSelf, in], InputForm];

(* 4. Beer's 5-neuron cpg.ns walker circuit (no sensory input): its walking rhythm is a limit cycle *)
cpg = {"taus" -> {6.196245, 2.515073, 8.67099, 9.918356, 9.252712},
  "biases" -> {14.589926, 10.762988, -3.919602, 9.76748, -2.826332}, "gains" -> {1, 1, 1, 1, 1},
  "weights" -> {-15.800203, 15.311454, -8.851767, -10.042705, -10.913972, 9.944963, -6.748288, 11.78331, -9.133361, 15.878405,
    -12.175295, -13.495099, 8.688801, 7.616306, 11.278046, -0.425391, -2.001676, -14.620253, 6.691054, -11.390638,
    -4.839062, -11.4249, 11.858115, 0.49043, -6.396606}};
yc = Array[Symbol["c" <> ToString[#]] &, 5];
dsCpg = DynamicalSystem[ctrnnFns @@ Join[Values[cpg], {{0, 0, 0, 0, 0}, yc}], Table[{yc[[i]], -40, 40}, {i, 5}]];
results["cpg"] = <|"circuit" -> Association[cpg], "equilibria" -> ep2json /@ EquilibriumPoints[dsCpg]|>;

Export["/work/tests/fixtures/dynamica.json", results, "RawJSON"];
Print["wrote tests/fixtures/dynamica.json with keys: ", Keys[results]];
