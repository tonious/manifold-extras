declare module '@rtsao/scc' {
    export default function tarjan(graph: Map<number, Set<number>>): Array<Set<number>>;
}