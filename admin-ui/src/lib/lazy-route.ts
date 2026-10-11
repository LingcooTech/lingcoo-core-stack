import { Children, isValidElement, lazy, type ComponentType, type ReactNode } from 'react';

const preloaders = new Map<unknown, () => Promise<unknown>>();

/** Share a single import between route preloading and React.lazy. No components are rendered here. */
export function lazyRoute<Props extends object>(
  loader: () => Promise<{ default: ComponentType<Props> }>,
) {
  let pending: ReturnType<typeof loader> | undefined;
  const load = () => (pending ??= loader());
  const component = lazy(load);
  preloaders.set(component, load);
  return component;
}

export function lazyNamed<T extends Record<string, unknown>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K,
): ComponentType {
  return lazyRoute(() => loader().then((mod) => ({ default: mod[name] as ComponentType })));
}

/** Start only the matched branch, including pages inside permission wrappers, in parallel. */
export function preloadRouteElements(elements: ReactNode[]) {
  const visit = (element: ReactNode) => {
    if (!isValidElement<{ children?: ReactNode }>(element)) return;
    const preload = preloaders.get(element.type);
    // React.lazy still receives the rejection and the route error boundary handles it.
    if (preload) void preload().catch(() => undefined);
    Children.forEach(element.props.children, visit);
  };
  elements.forEach(visit);
}
