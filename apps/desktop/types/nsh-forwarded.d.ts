// Keep forwarded JSX attributes reactive when a value appears or clears.
// NSH treats undefined as an unset native prop. Object spreads take a snapshot.
export type Forwarded<C extends (props: never) => unknown, K extends keyof Parameters<C>[0]> =
  ((props: Omit<Parameters<C>[0], K> & { [P in K]?: Parameters<C>[0][P] | undefined }) => ReturnType<C>) &
  Pick<C, keyof C>;
