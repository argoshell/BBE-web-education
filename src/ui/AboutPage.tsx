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
        <h3>Visually guided tasks</h3>
        <ul>
          <li>Izquierdo, E.J., Beer, R.D. and Setzler, M. <a href="https://github.com/edizquierdo/VisuallyGuidedAgent" target="_blank" rel="noreferrer">VisuallyGuidedAgent</a>: object-size discrimination and perceiving affordances (C++; agent by Matthew Setzler and Eduardo Izquierdo). Ported from commit df626ab, which carries no license, so it is fetched for testing and not redistributed.</li>
        </ul>
        <h3>C. elegans klinotaxis</h3>
        <ul>
          <li>Model and C++ code by Eduardo Izquierdo: <a href="https://github.com/edizquierdo/CE_orientation">CE_orientation</a> (built on Beer's CTRNN and TSearch; earlier parts in collaboration with Shawn Lockery and Randall Beer). The code has no license, so it is downloaded for testing, not redistributed.</li>
          <li>Izquierdo, E.J. and Lockery, S.R. (2010). Evolution and analysis of minimal neural circuits for klinotaxis in <i>Caenorhabditis elegans</i>. <i>J. Neuroscience</i> 30(39):12908–12917.</li>
          <li>Izquierdo, E.J. and Beer, R.D. (2013). Connecting a connectome to behavior: an ensemble of neuroanatomical models of <i>C. elegans</i> klinotaxis. <i>PLoS Computational Biology</i> 9(2):e1002890.</li>
          <li>Body, gradient, sensors, network, genome encoding and fitness follow <code>WormAgent.cpp</code> and <code>main.cpp</code> and are tested against them. Differences: <code>pastTheta</code>, uninitialized in the C++, starts at 0; the speed window spans one head sweep at any step size (420 steps at the original 0.01 s); the presets were evolved with this site's TSearch rather than the threaded C++ search.</li>
        </ul>
        <h3>Relational categorization</h3>
        <ul>
          <li>Williams, P.L., Beer, R.D. and Gasser, M. (2008). An embodied dynamical approach to relational categorization. <i>Proc. 30th Annual Conference of the Cognitive Science Society</i>, pp. 223–228.</li>
          <li>Williams, P.L. and Beer, R.D. (2013). Environmental feedback drives multiple behaviors from the same neural circuit. <i>Proc. ECAL 2013</i>, pp. 268–275.</li>
          <li>Beer, R.D. and Williams, P.L. (2015). Information processing and dynamics in minimally cognitive agents. <i>Cognitive Science</i> 39(1):1–38.</li>
          <li>Python code by Nathaniel Rodriguez: <a href="https://github.com/Nathaniel-Rodriguez/relcat" target="_blank" rel="noreferrer">relcat</a>. Ported from commit e12fc84, which carries no license, so it is fetched for testing and not redistributed. Body, rays, network, genome decoding and fitness are checked step by step against it, including its quirks (neuron outputs σ(g·y + θ), ray hits on the far side of the circle, the 20–65 size grid).</li>
        </ul>
        <h3>Minimally cognitive behavior</h3>
        <ul>
          <li>Beer, R.D. (1996). Toward the evolution of dynamical neural networks for minimally cognitive behavior. In P. Maes et al. (Eds.), <i>From Animals to Animats 4</i>, pp. 421–429. MIT Press.</li>
          <li>Slocum, A.C., Downey, D.C. and Beer, R.D. (2000). Further experiments in the evolution of minimally cognitive behavior: From perceiving affordances to selective attention. In J. Meyer et al. (Eds.), <i>From Animals to Animats 6</i>, pp. 430–439. MIT Press.</li>
          <li>Gallagher, J.C. and Beer, R.D. (1999). Evolution and analysis of dynamical neural networks for agents integrating vision, locomotion, and short-term memory. <i>Proc. GECCO 1999</i>, pp. 1273–1280.</li>
          <li>Goldenberg, E., Garcowski, J. and Beer, R.D. (2004). May we have your attention: Analysis of a selective attention task. <i>From Animals to Animats 8</i>, pp. 49–56.</li>
          <li>No code was published for these experiments. The orientation, delayed response and selective attention pages follow the papers, reuse the tested geometry of Beer&apos;s VisualAgent, and match the papers&apos; parameter counts. Each page lists what the papers leave open.</li>
        </ul>
        <h3>Associative learning</h3>
        <ul>
          <li>Izquierdo, E., Harvey, I. and Beer, R.D. (2008). Associative learning on a continuum in evolved dynamical neural networks. <i>Adaptive Behavior</i> 16(6):361–384.</li>
          <li>Phattanasri, P., Chiel, H.J. and Beer, R.D. (2007). The dynamics of associative learning in evolved model circuits. <i>Adaptive Behavior</i> 15(4):377–396.</li>
          <li>No code was published, so the task follows the paper. Its two evolved circuits (Tables A1 and A2) are the presets and are used to check the port. The page lists the details the paper leaves open and how they are filled.</li>
        </ul>
        <h3>Differences from the original</h3>
        <ul>
          <li>Search individuals carry ids and parent ids so lineages can be explored.</li>
          <li>The "CTRNN + angle sensor" controller is new: <code>Step</code> with leg-angle input Iᵢ = sᵢ·angle/30° to every neuron.</li>
          <li>Crossover decisions use a dedicated random stream seeded like the C++ global state, so runs are reproducible from the seed.</li>
          <li>The visual agent's fitness (catch circles, avoid lines; distance clipped at 45) and its symmetric genome follow Beer (2003); the C++ package ships no fitness function for it.</li>
          <li>The visually guided tasks follow Izquierdo's <code>main.cpp</code> exactly (trial grid, scores, product fitness for both tasks, symmetric genome). Identical repetitions are scored once and counted twice, and evolution in the browser defaults to this site's search settings (main.cpp uses uniform crossover with probability 0.5).</li>
          <li>The oscillator's fitness functions (average output change, or amplitude × closeness to a target period) are this site's, after the oscillation measures in the papers above.</li>
          <li>Phase portrait nullclines and fixed points are computed for 2-neuron slices with the other neurons frozen at the current instant.</li>
        </ul>
      </div>
    </div>
  );
}
