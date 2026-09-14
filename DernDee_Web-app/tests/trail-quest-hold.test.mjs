import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../apps/patient/src/trail-quest/', import.meta.url)

test('test-mode play does not show the hold-to-play banner', async () => {
  const [game, map] = await Promise.all([
    readFile(new URL('components/game/GameScreen.tsx', root), 'utf8'),
    readFile(new URL('components/journey/JourneyMap.tsx', root), 'utf8'),
  ])
  assert.doesNotMatch(game, /โหมดทดสอบระบบ/)
  assert.doesNotMatch(game, /กดค้างที่จอได้/)
  assert.doesNotMatch(map, /โหมดทดสอบระบบ/)
  assert.doesNotMatch(map, /กดค้างที่จอได้/)
})

test('touch hold rests the charge tube at 0', async () => {
  const [world, hud, engine] = await Promise.all([
    readFile(new URL('lib/game/world.ts', root), 'utf8'),
    readFile(new URL('components/game/Hud.tsx', root), 'utf8'),
    readFile(new URL('lib/game/engine.ts', root), 'utf8'),
  ])
  assert.match(world, /export const HOLD_REST_ANGLE = 0/)
  assert.match(hud, /Math\.max\(0, ratio \* 100\)/)
  assert.doesNotMatch(hud, /Math\.max\(6, ratio \* 100\)/)
  assert.match(engine, /HOLD_REST_ANGLE/)
  assert.doesNotMatch(engine, /IDLE_ANGLE/)
})
