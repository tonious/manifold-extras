import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

export default {
    input: [
        'lib/axes.mjs',
        'lib/chainhull.ts',
        'lib/batch.ts',
        'lib/meshutil.ts',
        'lib/wireframe.ts',
        'index.ts'
    ],
    output: {
        dir:"dist",
        format: 'es'
    },
    external: [
        'manifold-3d',
        'manifold-3d/manifoldCAD'
    ],
    plugins: [
        nodeResolve(), // Find packages in node_modules.
        commonjs(), // Convert any CJS dependencies to ESM.
        typescript(), // Transpile TypeScript.
    ]
}