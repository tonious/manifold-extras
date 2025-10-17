import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs';
import pkg from './package.json' with { type: "json" }

export default {
	input: 'index.js',
    output: [
        { file: pkg.main, format: 'cjs' },
        { file: pkg.module, format: 'es' }
    ],
    external: [
        'manifold-3d',
        'manifold-3d/manifoldCAD'
    ],
    plugins: [
        nodeResolve(), // Find packages in node_modules.
        commonjs(), // Convert any CJS dependencies to ESM.
    ]
}