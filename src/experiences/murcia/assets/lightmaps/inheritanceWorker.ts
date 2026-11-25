// Light inheritance's queries, off the main thread (`inheritanceSolve.ts`).
// One message in, one answer out; `inheritLight.ts` terminates the worker after.

import { solveInheritance, solutionTransfer, type InheritanceInput } from './inheritanceSolve';

self.onmessage = (event: MessageEvent<InheritanceInput>) => {
  const solution = solveInheritance(event.data);
  (self as unknown as Worker).postMessage(solution, solutionTransfer(solution));
};
