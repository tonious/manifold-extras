import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import { dts } from "rollup-plugin-dts";

export default [{
    // Bundle individual files.
    input: [
        'lib/axes.mjs',
        'lib/batch.ts',
        'lib/chainhull.ts',
        'lib/chamfer.ts',
        'lib/hershey.mjs',
        'lib/intersection.ts',
        'lib/math.ts',
        'lib/meshutil.ts',
        'lib/offset.ts',
        'lib/taper.ts',
        'lib/torus.ts',
        'lib/wireframe.ts'
    ],
    output: {
        dir: "dist",
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
}, {
    // Create a bundle of everything.
    input: 'index.ts',
    output: {
        file: "dist/index.js",
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
}, {
    // Roll up a top level type declaration.
    input: "./index.ts",
    output: {
        file: "dist/index.d.ts",
        format: "es",
    },
    external: [
        'manifold-3d',
        'manifold-3d/manifoldCAD'
    ],
    plugins: [
        dts()
    ],
}]