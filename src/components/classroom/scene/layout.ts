/** Shared measurements (metres) for the lecture hall, so the screen, stage, boards and camera presets agree. */

/** Height of the raised stage the physics model stands on. */
export const STAGE_Y = 0.7;
/** Stage footprint for the plain platform used by the other rooms. */
export const STAGE = { w: 14.8, d: 8.3, z: -0.7 };

/**
 * The hall's stage model (model.glb): platform, stairs, back wall with speakers and a lectern, in one mesh.
 * It is 2.0 x 0.73 x 1.12 units with the stage top at y = -0.293 and the back wall at z = -0.568; scaled by 7.4 it is
 * 14.8 m wide, with a 0.7 m high stage and its wall face at z = -4.9. `top` is the stage top in model units.
 */
export const HALL_MODEL = {
  src: '/models/hall/stage.glb',
  scale: 7.4,
  position: [0.1, 2.86, -0.7] as [number, number, number],
  top: -0.293,
};

/** The wall the screen and boards hang on (front face). */
export const WALL_Z = -4.9;

/** The projection screen that runs the slides: centre of the face. */
export const SCREEN = { x: 0, y: 3.18, w: 6.4, h: 3.26 };
/** The slides are drawn at 2:1 into the screen. */
export const SLIDE = { w: 6.22, h: 3.02, z: WALL_Z + 0.21 };

/**
 * The two whiteboards hang on the angled wings of the back wall. The wall is flat at z = WALL_Z for |x| < 3.5, then each
 * wing turns 30 degrees toward the audience (to z = -2.76 at |x| = 7.5).
 */
export const WING = { x0: 3.5, angle: Math.PI / 6 };
export const BOARD = { x: 5.5, y: 2.45, w: 3.5, h: 1.75, face: { w: 3.3, h: 1.55 } };

/** Where a whiteboard sits on its wing: `side` is -1 for the left wing and 1 for the right. */
export function boardPose(side: -1 | 1) {
  const z = WALL_Z + 0.05 + (BOARD.x - WING.x0) * Math.tan(WING.angle);
  return { pos: [side * BOARD.x, BOARD.y, z] as [number, number, number], rotY: -side * WING.angle };
}
