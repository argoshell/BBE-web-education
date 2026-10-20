// Regression fixtures for the visual categorization agent (VisualAgent.cpp / VisualObject.h).
// Separate from fixtures.cpp because VisualAgent.h and LeggedAgent.h both define Pi.

#include "VisualAgent.h"
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

// VisualAgent keeps its rays private; recompute ray lengths the same way Step does.
static vector<double> rayLengths(double cx, double cy, VisualObject &obj) {
  vector<double> out;
  double theta = -VisualAngle / 2;
  for (int i = 1; i <= 7; i++) {
    Ray r;
    if (abs(theta) < 0.0000001) r.m = INFINITY; else r.m = 1 / tan(theta);
    r.b = cy - r.m * cx;
    r.length = MaxRayLength;
    if (r.m == INFINITY) { r.startX = cx; r.startY = cy + BodySize / 2; }
    else { r.startX = cx + (BodySize / 2) * sin(theta); r.startY = cy + (BodySize / 2) * cos(theta); }
    obj.RayIntersection(r);
    out.push_back(r.length);
    theta += VisualAngle / 6;
  }
  return out;
}

static void trial(const char *name, VisualAgent &a, VisualObject &obj, double agentX, double objX) {
  a.Reset(0, 0);
  a.SetPositionX(agentX);
  obj.SetPositionX(objX);
  obj.SetPositionY(275);
  vector<double> ax, oy, rays;
  vector<vector<double> > outs(14);
  int steps = 0;
  for (double t = 0; obj.PositionY() > BodySize / 2; t += 0.1) {
    vector<double> r = rayLengths(a.PositionX(), a.PositionY(), obj);
    rays.insert(rays.end(), r.begin(), r.end());
    a.Step(0.1, obj);
    obj.Step(0.1);
    steps++;
    ax.push_back(a.PositionX());
    oy.push_back(obj.PositionY());
    for (int i = 0; i < 14; i++) outs[i].push_back(a.NervousSystem.NeuronOutput(i + 1));
  }
  key(name);
  printf("{\"steps\":%d,\"agentX0\":", steps); num(agentX);
  printf(",\"objectX\":"); num(objX);
  printf(",\"agentX\":"); arr(ax);
  printf(",\"objectY\":"); arr(oy);
  printf(",\"rays\":"); arr(rays);
  printf(",\"outputs\":["); for (int i = 0; i < 14; i++) { if (i) printf(","); arr(outs[i]); } printf("]");
  printf(",\"finalDistance\":"); num(a.PositionX() - objX);
  printf("}");
}

int main() {
  printf("{");
  VisualAgent a;
  ifstream ifs("categorize.ns");
  ifs >> a.NervousSystem;
  {
    CTRNN &c = a.NervousSystem;
    int n = c.CircuitSize();
    vector<double> taus, biases, gains, w;
    for (int i = 1; i <= n; i++) { taus.push_back(c.NeuronTimeConstant(i)); biases.push_back(c.NeuronBias(i)); gains.push_back(c.NeuronGain(i)); }
    for (int i = 1; i <= n; i++) for (int j = 1; j <= n; j++) w.push_back(c.ConnectionWeight(i, j));
    key("circuit");
    printf("{\"size\":%d,\"taus\":", n); arr(taus);
    printf(",\"biases\":"); arr(biases); printf(",\"gains\":"); arr(gains);
    printf(",\"weights\":"); arr(w); printf("}");
  }
  Line line;
  Circle circle;
  trial("lineMain", a, line, -50, 0);     // as in SimpleVisualMain.cpp
  trial("circleMain", a, circle, -50, 0);
  const double offsets[] = {-40, -12.5, 0, 7, 33};
  const char *ln[] = {"lineA", "lineB", "lineC", "lineD", "lineE"};
  const char *cn[] = {"circleA", "circleB", "circleC", "circleD", "circleE"};
  for (int k = 0; k < 5; k++) {
    trial(ln[k], a, line, 0, offsets[k]);
    trial(cn[k], a, circle, 0, offsets[k]);
  }
  printf("\n}\n");
  return 0;
}
