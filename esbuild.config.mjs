import * as esbuild from 'esbuild'
import { execSync } from 'child_process'

let version = 'unknown'
try {
  version = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
} catch {
  // Not in a git repo (e.g., Docker build)
}

await esbuild.build({
  entryPoints: ['./src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  outfile: 'dist/handler.js',
  sourcemap: true,
  format: 'cjs',
  define: {
    'process.env.SOURCEMAP_VERSION': JSON.stringify(version)
  }
})

console.log('Built handler.js')
