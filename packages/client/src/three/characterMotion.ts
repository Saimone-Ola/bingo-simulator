import type { CharacterAnimationState, CharacterPersonality } from './ProceduralCharacter';

export interface MotionTargets {
  rootY: number;
  torsoX: number;
  torsoZ: number;
  headX: number;
  headY: number;
  headZ: number;
  leftArmX: number;
  leftArmY: number;
  leftArmZ: number;
  rightArmX: number;
  rightArmY: number;
  rightArmZ: number;
  leftElbowX: number;
  rightElbowX: number;
  leftLegX: number;
  rightLegX: number;
  leftKneeX: number;
  rightKneeX: number;
  mouth: number;
  browLift: number;
  blink: number;
}

export const PERSONALITY_SPEED: Record<CharacterPersonality, number> = {
  CALM: 0.74,
  NERVOUS: 1.45,
  LOUD: 1.18,
  LUCKY: 0.96,
  GRUMPY: 0.7,
  DISTRACTED: 0.86,
  PRANKSTER: 1.26,
};

const BASE_TARGETS: MotionTargets = {
  rootY: 0,
  torsoX: 0,
  torsoZ: 0,
  headX: 0,
  headY: 0,
  headZ: 0,
  // Arms hang slightly away from the body: perfectly vertical arms are what
  // makes a procedural character read as a shop mannequin.
  leftArmX: -0.14,
  leftArmY: 0,
  leftArmZ: 0.16,
  rightArmX: -0.14,
  rightArmY: 0,
  rightArmZ: -0.16,
  leftElbowX: -0.34,
  rightElbowX: -0.34,
  leftLegX: 0,
  rightLegX: 0,
  leftKneeX: 0,
  rightKneeX: 0,
  mouth: 0.08,
  browLift: 0,
  blink: 1,
};

export function motionForState(
  state: CharacterAnimationState,
  wave: number,
  beat: number,
  seated: boolean,
): MotionTargets {
  const next = { ...BASE_TARGETS };
  const seat = () => {
    next.leftLegX = -1.36;
    next.rightLegX = -1.36;
    next.leftKneeX = 1.3;
    next.rightKneeX = 1.3;
    // Forearms angle down and in, so they rest rather than project. A shallow
    // elbow on a forward-rotated upper arm leaves the forearm sticking straight
    // out, which is what made every seated guest read as a zombie.
    next.leftArmX = -0.38;
    next.rightArmX = -0.38;
    next.leftArmZ = 0.1;
    next.rightArmZ = -0.1;
    next.leftElbowX = -0.65;
    next.rightElbowX = -0.65;
  };
  if (seated) seat();

  switch (state) {
    case 'SEATED_IDLE':
      seat();
      next.headY = wave * 0.05;
      next.torsoZ = wave * 0.014;
      break;
    case 'LOOK_AROUND':
      next.headY = wave * 0.55;
      next.headX = -0.06 + beat * 0.04;
      break;
    case 'LOOK_AT_STAGE':
      next.headX = -0.13;
      next.headY = wave * 0.07;
      next.torsoX = -0.03;
      break;
    case 'LOOK_AT_CARD':
      if (seated) seat();
      next.torsoX = 0.16;
      next.headX = 0.36;
      next.leftArmX = -0.62;
      next.rightArmX = -0.7;
      next.leftElbowX = -0.9;
      next.rightElbowX = -0.95;
      break;
    case 'MARK_NUMBER':
      if (seated) seat();
      next.torsoX = 0.19;
      next.headX = 0.4;
      next.rightArmX = -0.74 + beat * 0.025;
      next.rightArmY = -0.22 + wave * 0.04;
      next.rightArmZ = -0.05;
      next.rightElbowX = -0.3 + beat * 0.035;
      next.leftArmX = -0.6;
      break;
    case 'PICK_MARKER':
      if (seated) seat();
      next.torsoX = 0.12;
      next.torsoZ = -0.1;
      next.rightArmX = -0.9;
      next.rightArmZ = -0.42;
      next.rightElbowX = -0.75;
      break;
    case 'TALK':
      next.headY = wave * 0.16;
      next.headZ = wave * 0.03;
      next.leftArmX = -0.5 + beat * 0.18;
      next.leftArmZ = 0.4;
      next.leftElbowX = -1.05;
      next.mouth = 0.48 + beat * 0.34;
      next.browLift = 0.35;
      break;
    case 'LISTEN':
      next.headX = -0.05;
      next.headZ = 0.09;
      next.headY = wave * 0.04;
      next.browLift = 0.2;
      break;
    case 'LAUGH':
      next.torsoX = -0.1 + Math.abs(wave) * 0.09;
      next.headX = -0.18;
      next.leftArmZ = 0.44;
      next.rightArmZ = -0.44;
      next.leftElbowX = -0.85;
      next.rightElbowX = -0.85;
      next.mouth = 0.78;
      next.browLift = 0.6;
      next.blink = 0.25;
      break;
    case 'WAVE':
      // One arm up, hand sweeping side to side. The other stays down: a wave
      // with both arms is someone signalling an aircraft, not saying hello.
      // Nearly straight up and held clear of the head: at a shallower angle the
      // upper arm swings across the face instead of beside it.
      next.rightArmX = -2.46;
      next.rightArmZ = 0.5 + wave * 0.26;
      next.rightElbowX = -0.34;
      next.leftArmX = 0.06;
      next.leftElbowX = -0.28;
      next.headZ = 0.07;
      next.headY = wave * 0.12;
      next.torsoZ = wave * 0.03;
      next.mouth = 0.5;
      next.browLift = 0.34;
      break;
    case 'APPLAUD':
      // Hands have to *meet*. The previous version drove both arms outward on
      // the same beat, so they swung apart in sync and never touched — which
      // is why applauding did not read as applauding. `Math.abs` brings them
      // together at the middle of the cycle, which is the clap.
      // Chest height, not head height: a horizontal upper arm plus a fully bent
      // elbow puts the hands up by the face, which reads as blocking a punch.
      next.leftArmX = -1.05;
      next.rightArmX = -1.05;
      // Shoulder yaw converges the hands in front of the chest. Rotating Z
      // alone spreads the arms and never produces an actual clap.
      next.leftArmY = 0.1 + (1 - Math.abs(beat)) * 0.25;
      next.rightArmY = -next.leftArmY;
      next.leftArmZ = 0;
      next.rightArmZ = 0;
      next.leftElbowX = -0.55;
      next.rightElbowX = -0.55;
      next.torsoX = -0.04;
      next.headX = -0.05;
      next.mouth = 0.55;
      next.browLift = 0.45;
      break;
    case 'DANCE':
      // Weight shifting side to side, arms up and swinging in opposition,
      // knees soft. Distinct from CELEBRATE, which is a jump with both arms
      // straight up and stays put.
      next.rootY = Math.abs(beat) * 0.045;
      next.torsoZ = wave * 0.17;
      next.torsoX = -0.06;
      next.leftArmX = -1.5 + wave * 0.5;
      next.rightArmX = -1.5 - wave * 0.5;
      // Held wide, or the raised arm sweeps across the face on every beat.
      next.leftArmZ = -0.62;
      next.rightArmZ = 0.62;
      next.leftElbowX = -0.8;
      next.rightElbowX = -0.8;
      next.leftLegX = wave * 0.22;
      next.rightLegX = -wave * 0.22;
      next.leftKneeX = Math.max(0, -wave) * 0.34;
      next.rightKneeX = Math.max(0, wave) * 0.34;
      next.headZ = wave * 0.15;
      next.headY = wave * 0.22;
      next.mouth = 0.6;
      next.browLift = 0.4;
      break;
    case 'CELEBRATE':
      next.rootY = Math.max(0, beat) * 0.055;
      next.torsoX = -0.12;
      next.leftArmX = -2.5 + wave * 0.1;
      next.rightArmX = -2.5 - wave * 0.1;
      next.leftArmZ = 0.34;
      next.rightArmZ = -0.34;
      next.leftElbowX = -0.22;
      next.rightElbowX = -0.22;
      next.mouth = 0.84;
      next.browLift = 0.75;
      break;
    case 'DISAPPOINTED':
      next.torsoX = 0.22;
      next.headX = 0.36;
      next.leftArmX = 0.04;
      next.rightArmX = 0.04;
      next.leftElbowX = -0.12;
      next.rightElbowX = -0.12;
      next.mouth = 0.12;
      next.browLift = -0.5;
      break;
    case 'SCARED':
      next.rootY = Math.abs(beat) * 0.03;
      next.headX = -0.1;
      next.leftArmX = -1.5;
      next.rightArmX = -1.5;
      next.leftArmZ = 0.5;
      next.rightArmZ = -0.5;
      next.leftElbowX = -1.3;
      next.rightElbowX = -1.3;
      next.mouth = 0.72;
      next.browLift = 0.9;
      break;
    case 'ARGUE':
      next.torsoX = -0.05;
      next.headY = wave * 0.2;
      next.rightArmX = -1.0 + beat * 0.28;
      next.rightArmZ = -0.6;
      next.rightElbowX = -1.1;
      next.mouth = 0.55 + beat * 0.26;
      next.browLift = -0.35;
      break;
    case 'STAND_UP':
      next.rootY = Math.max(0, beat) * 0.02;
      next.torsoX = 0.06;
      break;
    case 'WALK':
      next.rootY = Math.abs(beat) * 0.02;
      next.leftArmX = wave * 0.46;
      next.rightArmX = -wave * 0.46;
      next.leftElbowX = -0.3 - Math.max(0, wave) * 0.35;
      next.rightElbowX = -0.3 - Math.max(0, -wave) * 0.35;
      next.leftLegX = -wave * 0.48;
      next.rightLegX = wave * 0.48;
      next.leftKneeX = Math.max(0, wave) * 0.42;
      next.rightKneeX = Math.max(0, -wave) * 0.42;
      next.torsoZ = wave * 0.03;
      break;
    case 'RUN':
      next.rootY = Math.abs(beat) * 0.045;
      next.torsoX = -0.13;
      next.leftArmX = wave * 0.8;
      next.rightArmX = -wave * 0.8;
      next.leftElbowX = -1.1;
      next.rightElbowX = -1.1;
      next.leftLegX = -wave * 0.9;
      next.rightLegX = wave * 0.9;
      next.leftKneeX = Math.max(0, wave) * 0.72;
      next.rightKneeX = Math.max(0, -wave) * 0.72;
      break;
    case 'ZOMBIE_IDLE':
    case 'ZOMBIE_MOVE':
    case 'ZOMBIE_FEED':
      // Deliberately goofy rather than horrific: stiff arms, wobbling head.
      next.torsoX = 0.2;
      next.torsoZ = wave * 0.12;
      next.headY = wave * 0.24;
      next.headZ = wave * 0.16;
      next.leftArmX = -1.5;
      next.rightArmX = -1.5;
      next.leftElbowX = -0.08;
      next.rightElbowX = -0.08;
      next.mouth = state === 'ZOMBIE_FEED' ? 0.9 : 0.55;
      next.browLift = 0.4;
      next.blink = 0.4;
      if (state === 'ZOMBIE_MOVE') {
        next.leftLegX = -wave * 0.4;
        next.rightLegX = wave * 0.4;
      }
      break;
    case 'RETURN_TO_SEAT':
      seat();
      next.rootY = Math.max(0, wave) * 0.06;
      next.torsoX = 0.1;
      next.headX = 0.14;
      next.mouth = 0.14;
      next.browLift = -0.3;
      break;
    default:
      next.headY = wave * 0.05;
      next.torsoZ = wave * 0.012;
      break;
  }
  return next;
}
