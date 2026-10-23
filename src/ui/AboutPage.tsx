export function AboutPage() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '16px' }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2>About</h2>
        <p>
          This site ports Randall Beer's <a href="https://rdbeer.pages.iu.edu/">EvolutionaryAgents</a> C++ code
          (CTRNN, TSearch, LeggedAgent, …) to TypeScript, so evolved agents can be simulated, edited, analyzed and
          re-evolved in the browser.
        </p>
        <p>
          The port is tested against the original: the C++ is compiled to WebAssembly with emscripten and its output
          is compared with the TypeScript output. Random number generation, CTRNN integration, the walker body
          and short TSearch runs agree to within floating-point rounding (random numbers match bit-for-bit;
          JavaScript's <code>Math.exp</code> can differ from C's <code>exp</code> in the last bit).
        </p>
        <h3>CTRNN oscillator</h3>
        <ul>
          <li>Beer, R.D. (1995). On the dynamics of small continuous-time recurrent neural networks. <i>Adaptive Behavior</i> 3(4):469–509.</li>
          <li>Mathayomchan, B. and Beer, R.D. (2002). Center-crossing recurrent neural networks for the evolution of rhythmic behavior. <i>Neural Computation</i> 14:2043–2051.</li>
          <li>Default circuit: <code>SimpleCTRNNMain.cpp</code> from EvolutionaryAgents.</li>
        </ul>
        <h3>One-legged walker</h3>
        <ul>
          <li>Beer, R.D. and Gallagher, J.C. (1992). Evolving dynamical neural networks for adaptive behavior. <i>Adaptive Behavior</i> 1:91–122.</li>
          <li>Beer, R.D., Chiel, H.J. and Gallagher, J.C. (1999). Evolution and analysis of model CPGs for walking I &amp; II. <i>J. Computational Neuroscience</i> 7:99–147.</li>
        </ul>
        <h3>Visual categorizer</h3>
        <ul>
          <li>Beer, R.D. (2003). The dynamics of active categorical perception in an evolved model agent. <i>Adaptive Behavior</i> 11(4):209–243.</li>
          <li>C++ implementation by Matthew Setzler (EvolutionaryAgents v1.2).</li>
        </ul>
        <h3>Differences from the original</h3>
        <ul>
          <li>Search individuals carry ids and parent ids so lineages can be explored.</li>
          <li>The "CTRNN + angle sensor" controller is new: <code>Step</code> with leg-angle input Iᵢ = sᵢ·angle/30° to every neuron.</li>
          <li>Crossover decisions use a dedicated random stream seeded like the C++ global state, so runs are reproducible from the seed.</li>
          <li>The visual agent's fitness (catch circles, avoid lines; distance clipped at 45) and its symmetric genome follow Beer (2003); the C++ package ships no fitness function for it.</li>
          <li>The oscillator's fitness functions (average output change, or amplitude × closeness to a target period) are this site's, after the oscillation measures in the papers above.</li>
          <li>Phase portrait nullclines and fixed points are computed for 2-neuron slices with the other neurons frozen at the current instant.</li>
        </ul>
      </div>
    </div>
  );
}
