import { DRACOLoader } from "../../libs/three.js-r132/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "../../libs/three.js-r132/examples/jsm/loaders/GLTFLoader.js";

const THREE = window.MINDAR.IMAGE.THREE;

// Function to initialize the MindARThree instance
const initializeMindAR = () => {
  return new window.MINDAR.IMAGE.MindARThree({
    container: document.body, // Attach AR experience to the body
    imageTargetSrc: "../../assets/targets/storybook.mind" // Path to image target
  });
};

// Configure GLTFLoader with DRACOLoader
const configureGLTFLoader = () => {
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("../../libs/draco/"); // Path to DRACO decoder files
  loader.setDRACOLoader(dracoLoader);
  return loader;
};

// Function to set up lighting in the scene
const setupLighting = (scene) => {
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1); // Add a light source
  scene.add(light);
};

// Function to load the GLB model with animations
const loadModel = async (path, scale = { x: 0.15, y: 0.15, z: 0.15 }, position = { x: 0, y: -0.4, z: 0 }) => {
  const loader = configureGLTFLoader();
  const model = await loader.loadAsync(path);

  // Set the scale
  model.scene.scale.set(scale.x, scale.y, scale.z);

  // Set the position
  model.scene.position.set(position.x, position.y, position.z);

  return model;
};

// Enable zoom and rotation
const enableZoomAndRotation = (camera, model) => {
  let scaleFactor = 1.0; // Default scaling factor
  let isDragging = false;
  let previousPosition = { x: 0, y: 0 };
  let initialDistance = null; // Used for pinch-to-zoom on mobile

  // Handle mouse and touch start
  const handleStart = (event) => {
    if (event.touches && event.touches.length === 1) {
      // Single touch: start drag
      isDragging = true;
      previousPosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    } else if (event.touches && event.touches.length === 2) {
      // Pinch-to-zoom start
      isDragging = false; // Disable dragging during zoom
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      initialDistance = Math.sqrt(dx * dx + dy * dy);
    } else if (event.type === "mousedown") {
      // Mouse: start drag
      isDragging = true;
      previousPosition = { x: event.clientX, y: event.clientY };
    }
  };

  // Handle mouse and touch move
  const handleMove = (event) => {
    if (isDragging && (event.type === "mousemove" || (event.touches && event.touches.length === 1))) {
      const currentPosition = event.touches
        ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
        : { x: event.clientX, y: event.clientY };

      const deltaMove = {
        x: currentPosition.x - previousPosition.x,
        y: currentPosition.y - previousPosition.y
      };

      // Rotate the model
      model.scene.rotation.y += deltaMove.x * 0.01; // Horizontal rotation
      model.scene.rotation.x += deltaMove.y * 0.01; // Vertical rotation
      previousPosition = currentPosition;
    } else if (event.touches && event.touches.length === 2 && initialDistance) {
      // Pinch-to-zoom
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);

      // Adjust scale factor
      const zoomDelta = (currentDistance - initialDistance) * 0.005; // Adjust zoom sensitivity
      scaleFactor = Math.min(Math.max(scaleFactor + zoomDelta, 0.5), 2); // Clamp scale between 0.5 and 2
      model.scene.scale.set(scaleFactor, scaleFactor, scaleFactor);

      initialDistance = currentDistance; // Update the distance for next calculation
    }
  };

  // Handle mouse and touch end
  const handleEnd = () => {
    isDragging = false;
    initialDistance = null; // Reset pinch-to-zoom
  };

  // Add event listeners
  window.addEventListener("mousedown", handleStart);
  window.addEventListener("mousemove", handleMove);
  window.addEventListener("mouseup", handleEnd);

  window.addEventListener("touchstart", handleStart);
  window.addEventListener("touchmove", handleMove);
  window.addEventListener("touchend", handleEnd);
};

// Function to set up anchors with automatic animation, audio playback, and sound effect
const setupAnchorWithAutoAnimationAndAudio = async (mindarThree, model, anchorId, audioPath, soundEffectPath) => {
  const anchor = mindarThree.addAnchor(anchorId);
  anchor.group.add(model.scene);

  // Create a unique mixer for this model
  const mixer = new THREE.AnimationMixer(model.scene);
  const animations = model.animations;

  const actions = []; // Array to store actions for all animations

  if (animations.length > 0) {
    animations.forEach((clip) => {
      const action = mixer.clipAction(clip);
      action.play(); // Play each animation
      actions.push(action); // Store all actions
    });
  }

  // Load the audio for narration and sound effect
  const audio = new Audio(audioPath);
  audio.loop = false; // Narration should not loop automatically
  const soundEffect = new Audio(soundEffectPath); // Sound effect
  soundEffect.loop = false; // Sound effect should not loop automatically

  // Function to manage playback sequence
  const playAudioSequence = () => {
    // Play narration first
    audio.currentTime = 0;
    audio.play();

    // Delay sound effect until narration ends
    audio.onended = () => {
      soundEffect.currentTime = 0;
      soundEffect.play();

      // Ensure the narration loops after the sound effect finishes
      soundEffect.onended = () => {
        playAudioSequence(); // Restart the sequence
      };
    };
  };

  anchor.onTargetFound = () => {
    model.scene.visible = true;
    if (animations.length > 0) {
      actions.forEach((action) => {
        action.paused = false; // Resume all animations
        if (!action.isRunning()) {
          action.play(); // Ensure animation starts if it was not playing
        }
      });
    }

    playAudioSequence(); // Start the audio sequence
  };

  anchor.onTargetLost = () => {
    model.scene.visible = false;
    if (animations.length > 0) {
      actions.forEach((action) => {
        action.paused = true; // Pause all animations
      });
    }

    // Pause both narration and sound effect
    audio.pause();
    soundEffect.pause();

    // Reset audio progress
    audio.currentTime = 0;
    soundEffect.currentTime = 0;
  };

  return mixer;
};

const enablePlayOnInteraction = (renderer, scene, camera, model, mixer) => {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const handleInteraction = (event) => {
    if (event.touches) {
      pointer.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
    } else {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    // Raycasting to check if the model is clicked
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(model.scene.children, true);

    if (intersects.length > 0) {
      // Toggle pause for all actions (not just the first one)
      mixer._actions.forEach((action) => {
        action.paused = !action.paused; // Toggle pause/play for all animations
        if (!action.isRunning()) {
          action.play(); // Ensure animation starts if it was not playing
        }
      });
    }
  };

  // Add event listeners for interaction
  window.addEventListener("pointerdown", handleInteraction);
  window.addEventListener("touchstart", handleInteraction);
};

const startRenderingLoop = (renderer, scene, camera, options) => {
  renderer.setAnimationLoop(() => {
    const delta = renderer.clock.getDelta();
    if (options.update) options.update(delta);
    renderer.render(scene, camera);
  });
};

document.addEventListener("DOMContentLoaded", () => {
  const start = async () => {
    const mindarThree = initializeMindAR();
    const { renderer, scene, camera } = mindarThree;

    renderer.clock = new THREE.Clock(); // Create a clock for animations
    setupLighting(scene); // Add lighting

    // Load models and set up anchors
    const pg1Model = await loadModel(
      "../../assets/models/satu.glb",
      { x: 0.08, y: 0.08, z: 0.08 }, // Scale for pg1
      { x: 0, y: -0.4, z: 0 } // Position for pg1
    );
    const pg2Model = await loadModel(
      "../../assets/models/dua.glb",
      { x: 0.06, y: 0.06, z: 0.06 },
      { x: 0, y: -0.4, z: 0 }
    );
    const pg3Model = await loadModel(
      "../../assets/models/tiga.glb",
      { x: 0.1, y: 0.1, z: 0.1 },
      { x: 0, y: -0.4, z: 0 }
    );
    const pg4Model = await loadModel(
      "../../assets/models/empat.glb",
      { x: 0.2, y: 0.2, z: 0.2 },
      { x: 0, y: -0.4, z: 0 }
    );
    const pg5Model = await loadModel(
      "../../assets/models/lima.glb",
      { x: 0.08, y: 0.08, z: 0.08 },
      { x: 0, y: -0.4, z: 0 }
    );
    const pg6Model = await loadModel(
      "../../assets/models/enam.glb",
      { x: 0.15, y: 0.15, z: 0.15 },
      { x: 0, y: -0.4, z: 0 }
    );
    const pg7Model = await loadModel(
      "../../assets/models/tujuh.glb",
      { x: 0.1, y: 0.1, z: 0.1 },
      { x: 0, y: -0.4, z: 0 }
    );
    const pg8Model = await loadModel(
      "../../assets/models/lapan.glb",
      { x: 0.1, y: 0.1, z: 0.1 },
      { x: 0, y: -0.4, z: 0 }
    );
    const pg9Model = await loadModel(
      "../../assets/models/sembilan.glb",
      { x: 0.2, y: 0.2, z: 0.2 },
      { x: 0, y: -0.4, z: 0 }
    );
    const pg10Model = await loadModel(
      "../../assets/models/sepuluh.glb",
      { x: 0.1, y: 0.1, z: 0.1 },
      { x: 0, y: -0.4, z: 0 }
    );

    const pg1Mixer = await setupAnchorWithAutoAnimationAndAudio(
      mindarThree,
      pg1Model,
      0,
      "../../assets/sounds/Bahasa Bajau/narratorone.mp3",
      "../../assets/sounds/effectsatu.mp3"
    );

    const pg2Mixer = await setupAnchorWithAutoAnimationAndAudio(
      mindarThree,
      pg2Model,
      1,
      "../../assets/sounds/Bahasa Bajau/narratortwo.mp3",
      "../../assets/sounds/effectdua.mp3"
    );

    const pg3Mixer = await setupAnchorWithAutoAnimationAndAudio(
      mindarThree,
      pg3Model,
      2,
      "../../assets/sounds/Bahasa Bajau/narratorthree.mp3",
      "../../assets/sounds/effecttiga.mp3"
    );

    const pg4Mixer = await setupAnchorWithAutoAnimationAndAudio(
      mindarThree,
      pg4Model,
      3,
      "../../assets/sounds/Bahasa Bajau/narratorfour.mp3",
      "../../assets/sounds/effectempat.mp3"
    );

    const pg5Mixer = await setupAnchorWithAutoAnimationAndAudio(
      mindarThree,
      pg5Model,
      4,
      "../../assets/sounds/Bahasa Bajau/narratorfive.mp3",
      "../../assets/sounds/effectlima.mp3"
    );

    const pg6Mixer = await setupAnchorWithAutoAnimationAndAudio(
      mindarThree,
      pg6Model,
      5,
      "../../assets/sounds/Bahasa Bajau/narratorsix.mp3",
      "../../assets/sounds/effectenam.mp3"
    );

    const pg7Mixer = await setupAnchorWithAutoAnimationAndAudio(
      mindarThree,
      pg7Model,
      6,
      "../../assets/sounds/Bahasa Bajau/narratorseven.mp3",
      "../../assets/sounds/effecttujuh.mp3"
    );

    const pg8Mixer = await setupAnchorWithAutoAnimationAndAudio(
      mindarThree,
      pg8Model,
      7,
      "../../assets/sounds/Bahasa Bajau/narratoreight.mp3",
      "../../assets/sounds/effectlapan.mp3"
    );

    const pg9Mixer = await setupAnchorWithAutoAnimationAndAudio(
      mindarThree,
      pg9Model,
      8,
      "../../assets/sounds/Bahasa Bajau/narratornine.mp3",
      "../../assets/sounds/effectsembilan.mp3"
    );

    const pg10Mixer = await setupAnchorWithAutoAnimationAndAudio(
      mindarThree,
      pg10Model,
      9,
      "../../assets/sounds/Bahasa Bajau/narratorten.mp3",
      "../../assets/sounds/effectsepuluh.mp3"
    );

    // Enable interaction for each model
    enablePlayOnInteraction(renderer, scene, camera, pg1Model, pg1Mixer);
    enableZoomAndRotation(camera, pg1Model);

    enablePlayOnInteraction(renderer, scene, camera, pg2Model, pg2Mixer);
    enableZoomAndRotation(camera, pg2Model);

    enablePlayOnInteraction(renderer, scene, camera, pg3Model, pg3Mixer);
    enableZoomAndRotation(camera, pg3Model);

    enablePlayOnInteraction(renderer, scene, camera, pg4Model, pg4Mixer);
    enableZoomAndRotation(camera, pg4Model);

    enablePlayOnInteraction(renderer, scene, camera, pg5Model, pg5Mixer);
    enableZoomAndRotation(camera, pg5Model);

    enablePlayOnInteraction(renderer, scene, camera, pg6Model, pg6Mixer);
    enableZoomAndRotation(camera, pg6Model);

    enablePlayOnInteraction(renderer, scene, camera, pg7Model, pg7Mixer);
    enableZoomAndRotation(camera, pg7Model);

    enablePlayOnInteraction(renderer, scene, camera, pg8Model, pg8Mixer);
    enableZoomAndRotation(camera, pg8Model);

    enablePlayOnInteraction(renderer, scene, camera, pg9Model, pg9Mixer);
    enableZoomAndRotation(camera, pg9Model);

    enablePlayOnInteraction(renderer, scene, camera, pg10Model, pg10Mixer);
    enableZoomAndRotation(camera, pg10Model);

    // Start AR session and rendering loop
    await mindarThree.start();
    startRenderingLoop(renderer, scene, camera, {
      update: (delta) => {
        pg1Mixer.update(delta);
        pg2Mixer.update(delta);
        pg3Mixer.update(delta);
        pg4Mixer.update(delta);
        pg5Mixer.update(delta);
        pg6Mixer.update(delta);
        pg7Mixer.update(delta);
        pg8Mixer.update(delta);
        pg9Mixer.update(delta);
        pg10Mixer.update(delta);
      }
    });
  };

  start();
});
