export interface DocsDependencies {
  readonly now: () => Date;
}
export function pickDocsDependencies(input: DocsDependencies): DocsDependencies {
  return {
    now: input.now,
  };
}
