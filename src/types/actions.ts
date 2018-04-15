export interface ActionDefinition<N = string, P = {}> {
  name: N;
  params: P;
}

export interface Action2 {
  getName(): string;
  getParams(): string;

  preFlight(): void;

  // Optimistic UI
  getAffectedKeys?(): string[];
  getPredictedValueForKey?(key: string, currentValue: any): any;
}
