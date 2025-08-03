
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Info, X, Hand, ZoomIn, MousePointerClick, ChevronDown } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { getCategoryForItem } from '../components/map/pathwaysData';
import { getEmotionsForExperience } from '../components/map/emotionMapping';
import EmotionWheel from '../components/map/EmotionWheel';
import BeliefBuilder from '../components/map/BeliefBuilder';

const NodeTypesLegend = () =>
<div className="absolute bottom-4 right-4 bg-black bg-opacity-50 border border-gray-700 p-3 text-xs w-48 z-20 rounded-md">
    <h3 className="font-bold mb-2 text-white text-sm">NODE TYPES</h3>
    <div className="space-y-2 text-gray-400">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full border border-gray-500"></div>
        <span>Seed - Beginning of belief</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full border border-gray-500"></div>
        <span>Shifter - Turning point of belief</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full border border-gray-500"></div>
        <span>Affirmer - Strengthening beliefs</span>
      </div>
    </div>
  </div>;


const SelectedNodeInfo = ({ node, onClose, side, splitSelection, isBeliefSide = false, hideCloseButton = false }) => {
  const getDisplayTitle = (node) => {
    if (node.label.startsWith("Other - ")) {
      const category = node.label.replace("Other - ", "");
      return `${category} Related Experience`;
    }
    return node.label;
  };

  const isRight = side === 'right';

  // Check if we're in the second split selection phase
  const isSecondSplit = splitSelection?.first && splitSelection?.second;

  return (
    <AnimatePresence>
      {node &&
      <motion.div
        className={`absolute top-[140px] bg-black bg-opacity-70 border border-gray-700 p-4 text-sm w-64 z-20 rounded-lg shadow-2xl ${isRight ? 'right-4' : 'left-4'}`}
        initial={{ opacity: 0, x: isRight ? 20 : -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: isRight ? 20 : -20 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}>
        
          {!hideCloseButton && (
            <button onClick={onClose} className="absolute top-2 right-2 text-gray-500 hover:text-white transition-colors">
              <X size={18} />
            </button>
          )}
          
          {isSecondSplit && isBeliefSide ? (
            <>
              <h3 className="font-semibold text-white text-base mb-1">Belief created: Unknown (yet).</h3>
              <p className="text-[#E1C15C] mb-3 text-xs tracking-wider">Hidden</p>
              <p className="text-gray-400 text-sm leading-relaxed">Every experience carries a deeper layer — a belief it created, strengthened or broke apart.</p>
            </>
          ) : (
            <>
              <h3 className="font-semibold text-white text-base mb-1">{getDisplayTitle(node)}</h3>
              <p className="text-[#E1C15C] mb-3 text-xs tracking-wider">{node.type}</p>
              <p className="text-gray-400 text-sm leading-relaxed">This experience has left a mark, shaping the way you think and move forward.</p>
            </>
          )}
        </motion.div>
      }
    </AnimatePresence>);

};

export default function MapPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const pathways = searchParams.getAll('pathways');

  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const nodesRef = useRef([]);
  const mousePositionRef = useRef({ x: null, y: null, active: false, pinchDistance: null, isPinching: false, pinchCenterWorldX: null, pinchCenterWorldY: null });

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, text: '' });
  const [canvasReady, setCanvasReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPos = useRef({ x: 0, y: 0 });
  const lastTouchPos = useRef({ x: 0, y: 0 });
  const [nodeImages, setNodeImages] = useState({ img1: null, img2: null });
  
  const [mapStage, setMapStage] = useState('loading'); // loading, introToast, tutorial, followUpToast, selection_prompt, interactive, node_focus, emotion_selection, belief_intro
  const [focusedNode, setFocusedNode] = useState(null);
  const [showNodeSplit, setShowNodeSplit] = useState(false);
  const [splitSelection, setSplitSelection] = useState({ first: null, second: null, beliefSide: null });
  const [showTapOtherSideMessage, setShowTapOtherSideMessage] = useState(false);
  const [infoBoxSide, setInfoBoxSide] = useState('left');
  const [bottomMessage, setBottomMessage] = useState('');
  const [emotions, setEmotions] = useState([]);
  const [selectedEmotion, setSelectedEmotion] = useState(null);
  const [showBeliefBuilder, setShowBeliefBuilder] = useState(false);
  const [completedBelief, setCompletedBelief] = useState(null);
  const [showMergedView, setShowMergedView] = useState(false);

  const handleContinueAfterEmotion = () => {
    // This function is triggered when the user clicks "Continue" after selecting an emotion.
    // It will change the map stage to start the belief formation sequence.
    setMapStage('belief_intro');
  };

  const handleBeliefComplete = (belief) => {
    setCompletedBelief(belief);
    setShowBeliefBuilder(false);
    
    // Start merge sequence after showing completed belief for 3 seconds
    setTimeout(() => {
      setShowMergedView(true);
    }, 3000);
    
    console.log('Completed belief:', belief.fullSentence);
  };

  const simulate = useCallback(() => {
    const nodes = nodesRef.current;
    const canvas = canvasRef.current;
    if (nodes.length === 0 || !canvas) return;

    // Freeze all node physics when in focus mode
    if (mapStage === 'node_focus' || mapStage === 'emotion_selection' || mapStage === 'belief_intro' || showMergedView) {
      nodes.forEach(node => {
        node.vx = 0;
        node.vy = 0;
      });
      return;
    }

    const centerForce = 0.0001;
    const repulsionStrength = 800;
    const damping = 0.95;

    nodes.forEach((node) => {
      if (node.isDragging) return;

      // Center attraction (adjusted for pan and zoom to pull towards visual center)
      const targetWorldX = (canvas.width / 2 - pan.x) / zoom;
      const targetWorldY = (canvas.height / 2 - pan.y) / zoom;
      node.vx += (targetWorldX - node.x) * centerForce;
      node.vy += (targetWorldY - node.y) * centerForce;

      // Node repulsion
      nodes.forEach((otherNode) => {
        if (node.id === otherNode.id) return;
        const dx = otherNode.x - node.x;
        const dy = otherNode.y - node.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));

        const minDistance = node.radius + otherNode.radius;
        let forceMagnitude = 0;

        // Standard inverse-square repulsion to keep nodes from clumping
        forceMagnitude += repulsionStrength / (dist * dist);

        // Add a much stronger, linear "spring" force if they actually overlap
        if (dist < minDistance) {
          forceMagnitude += (minDistance - dist) * 0.5;
        }

        const forceX = dx / dist * forceMagnitude;
        const forceY = dy / dist * forceMagnitude;

        // Apply the combined force to push the node away
        node.vx -= forceX;
        node.vy -= forceY;
      });

      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx;
      node.y += node.vy;
    });
  }, [pan, zoom, mapStage, showMergedView]);

  const render = useCallback((time) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const nodes = nodesRef.current;
    if (nodes.length === 0) return;

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Apply background dimming if in node focus or emotion selection mode or merged view
    if (mapStage === 'node_focus' || mapStage === 'emotion_selection' || mapStage === 'belief_intro' || showMergedView) {
      ctx.globalAlpha = 0.3;
    }

    // Draw connections
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    nodes.forEach((nodeA) => {
      nodes.forEach((nodeB) => {
        if (nodeA.id >= nodeB.id) return;
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 400) {
          ctx.globalAlpha = Math.max(0, 1 - dist / 400) * ((mapStage === 'node_focus' || mapStage === 'emotion_selection' || mapStage === 'belief_intro' || showMergedView) ? 0.1 : 0.3);
          ctx.beginPath();
          ctx.moveTo(nodeA.x, nodeA.y);
          ctx.lineTo(nodeB.x, nodeB.y);
          ctx.stroke();
        }
      });
    });
    ctx.globalAlpha = 1;

    // Draw nodes
    nodes.forEach((node) => {
      const isSelected = selectedNodeId === node.id;
      const isHovered = hoveredNodeId === node.id;
      const isPromptStage = mapStage === 'selection_prompt';
      
      // Flags for the current node being the focused/special one
      const isFocusedNode = mapStage === 'node_focus' && focusedNode && focusedNode.id === node.id;
      const isEmotionSelectionNode = mapStage === 'emotion_selection' && focusedNode && focusedNode.id === node.id;
      const isBeliefIntroNode = mapStage === 'belief_intro' && focusedNode && focusedNode.id === node.id;
      const isMergedVisualizationNode = showMergedView && focusedNode && focusedNode.id === node.id;

      // Determine the base alpha for the node's main body (image/circle)
      let nodeBaseAlpha = 1;
      const shouldDimBackground = (mapStage === 'node_focus' || mapStage === 'emotion_selection' || mapStage === 'belief_intro' || showMergedView);
      const isThisNodeHighlighted = (isFocusedNode || isEmotionSelectionNode || isBeliefIntroNode || isMergedVisualizationNode);

      if (shouldDimBackground && !isThisNodeHighlighted) {
        nodeBaseAlpha = 0.3; // Dim non-highlighted nodes
      }
      ctx.globalAlpha = nodeBaseAlpha; // Set alpha for node's main body content

      // Outer pulse ring for selected/hovered OR for prompt stage OR for focused/special node
      if (isSelected || isHovered || isPromptStage || isThisNodeHighlighted) {
        const pulseAmount = isPromptStage ? Math.sin(time / 250) * 6 : Math.sin(time / 400 + node.id) * 4;
        const ringPulse = pulseAmount;
        ctx.strokeStyle = isPromptStage ? '#CCCCCC' : (isThisNodeHighlighted ? '#ffffff' : (isSelected ? '#ffffff' : '#aaaaaa'));
        ctx.lineWidth = isPromptStage ? 2 / zoom : (isThisNodeHighlighted ? 3 / zoom : (isSelected ? 2 / zoom : 1 / zoom));
        
        // Temporarily set alpha for the pulse ring stroke
        const pulseAlpha = isPromptStage ? 0.6 : (isThisNodeHighlighted ? 0.8 : 0.6);
        ctx.globalAlpha = pulseAlpha;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 1.2 + ringPulse / zoom, 0, Math.PI * 2);
        ctx.stroke();
        
        // Restore base alpha for the main node body drawing
        ctx.globalAlpha = nodeBaseAlpha;
      }

      // Calculate node scale for breathing effect
      let nodeScale = 1;
      if (isPromptStage) {
        nodeScale = 1 + Math.sin(time / 800 + node.id * 0.3) * 0.03;
      } else if (isThisNodeHighlighted) {
        // Subtle pulse for highlighted node
        nodeScale = 1 + Math.sin(time / 600) * 0.02;
      }

      // Main node body
      if (node.image) {
        const baseImageSize = node.radius * 2;
        const imageSize = baseImageSize * nodeScale;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(node.image, node.x - imageSize / 2, node.y - imageSize / 2, imageSize, imageSize);
        ctx.imageSmoothingEnabled = false;
      } else {
        const scaledRadius = node.radius * nodeScale;
        ctx.fillStyle = '#2d2d2d';
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.arc(node.x, node.y, scaledRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Reset alpha for next node to avoid affecting subsequent drawings outside this node loop
      ctx.globalAlpha = 1;
    });

    ctx.restore();
  }, [selectedNodeId, hoveredNodeId, zoom, pan, mapStage, focusedNode, showMergedView]);

  const handleNodeClick = useCallback((clickedNode) => {
    if (mapStage === 'tutorial') {
      handleDismissTutorial();
      return; // Stop here, don't proceed to selection logic yet
    }
    
    if (mapStage === 'selection_prompt') {
      setSelectedNodeId(null); // Hide info box before zooming
      // Start zoom-in sequence
      setMapStage('node_focus');
      setFocusedNode(clickedNode);
      setSplitSelection({ first: null, second: null, beliefSide: null }); // Reset state for new selection
      setShowTapOtherSideMessage(false); // Reset message state
      setBottomMessage(''); // Reset bottom message
      
      // Calculate target zoom and pan to center and zoom into the node
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const targetZoom = 4; // Zoom level to match reference image
      const targetPanX = canvas.width / 2 - clickedNode.x * targetZoom;
      const targetPanY = canvas.height / 2 - clickedNode.y * targetZoom;
      
      // Animate zoom and pan
      const startZoom = zoom;
      const startPanX = pan.x;
      const startPanY = pan.y;
      const duration = 400; // 400ms animation
      const startTime = Date.now();
      
      const animateZoom = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        
        const currentZoom = startZoom + (targetZoom - startZoom) * easeProgress;
        const currentPanX = startPanX + (targetPanX - startPanX) * easeProgress;
        const currentPanY = startPanY + (targetPanY - startPanY) * easeProgress;
        
        setZoom(currentZoom);
        setPan({ x: currentPanX, y: currentPanY });
        
        if (progress < 1) {
          requestAnimationFrame(animateZoom);
        } else {
          // Animation complete - show message and then node split
          setTimeout(() => {
            setShowNodeSplit(true);
          }, 4700); // 4.7 seconds after zoom completes
        }
      };
      
      requestAnimationFrame(animateZoom);
      return;
    }
    
    // Regular node interaction for other stages
    if (mapStage === 'node_focus' || showNodeSplit || mapStage === 'emotion_selection' || mapStage === 'belief_intro' || showMergedView) return; // Prevent interaction during focus/split/emotion selection
    
    clickedNode.isDragging = true;
    setSelectedNodeId(clickedNode.id);
    setInfoBoxSide('left'); // Default to left for general dragging
    setTooltip((prev) => ({ ...prev, show: false }));
    if(canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
  }, [mapStage, zoom, pan, showNodeSplit, showMergedView]);

  const handleHalfClick = (side) => {
    // Prevent re-clicking an already selected half or if in emotion selection
    if (splitSelection.first === side || splitSelection.second === side || mapStage === 'emotion_selection') return;

    if (!splitSelection.first) {
        // This is the first click
        setSplitSelection({ ...splitSelection, first: side });
        setSelectedNodeId(focusedNode.id); // Show the info box
        setInfoBoxSide(side); // On the correct side

        // Start timer to show the "Tap the other side" message
        setTimeout(() => {
            setShowTapOtherSideMessage(true);
        }, 3000);
    } else {
        // This is the second click
        setShowTapOtherSideMessage(false); // Hide the message
        setSplitSelection({ ...splitSelection, second: side, beliefSide: side });
        setSelectedNodeId(focusedNode.id); // Keep info box visible
        setInfoBoxSide(side); // Move info box to the newly clicked side

        // Start the sequence for the emotion wheel
        setTimeout(() => {
            setMapStage('emotion_selection');
            // Keep showNodeSplit true so the split visualization remains visible
            setBottomMessage('Looking back on this moment — how did it make you feel?');
            // Get emotions specific to this experience
            const specificEmotions = getEmotionsForExperience(focusedNode.label);
            setEmotions(specificEmotions);
        }, 7000); // Changed to 7 seconds
    }
  };

  const handleDismissTutorial = useCallback(() => {
    if (mapStage === 'tutorial') {
      setMapStage('followUpToast');
    }
  }, [mapStage]);


  const handleMouseDown = useCallback((e) => {
    if (mapStage === 'node_focus' || showNodeSplit || mapStage === 'emotion_selection' || mapStage === 'belief_intro' || showMergedView) return; // Prevent interaction during focus/split/emotion selection

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert mouse screen coordinates to world coordinates
    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;

    const clickedNode = [...nodesRef.current].reverse().find((node) =>
    Math.sqrt((worldX - node.x) ** 2 + (worldY - node.y) ** 2) < node.radius
    );

    if (clickedNode) {
      handleNodeClick(clickedNode);
    } else {
      setSelectedNodeId(null);
      setTooltip((prev) => ({ ...prev, show: false })); // Hide tooltip when clicking empty space
      setIsPanning(true);
      lastPanPos.current = { x: mouseX, y: mouseY }; // Store screen coords for pan delta
      canvas.style.cursor = 'grabbing';
    }
  }, [zoom, pan, handleNodeClick, mapStage, showNodeSplit, showMergedView]);

  const handleMouseMove = useCallback((e) => {
    if (mapStage === 'node_focus' || showNodeSplit || mapStage === 'emotion_selection' || mapStage === 'belief_intro' || showMergedView) return; // Prevent interaction during focus/split/emotion selection

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Update mousePositionRef (screen coords for tooltip)
    mousePositionRef.current = { x: mouseX, y: mouseY, active: true };

    // Convert mouse screen coordinates to world coordinates for node interaction
    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;

    const draggingNode = nodesRef.current.find((node) => node.isDragging);
    if (draggingNode) {
      draggingNode.x = worldX; // Update node's world coordinates
      draggingNode.y = worldY;
      draggingNode.vx = 0;
      draggingNode.vy = 0;
      canvas.style.cursor = 'grabbing';
    } else if (isPanning) {
      // Panning logic
      const dx = mouseX - lastPanPos.current.x;
      const dy = mouseY - lastPanPos.current.y;
      setPan((prevPan) => ({ x: prevPan.x + dx, y: prevPan.y + dy }));
      lastPanPos.current = { x: mouseX, y: mouseY };
      canvas.style.cursor = 'grabbing';
    } else {
      // Hover logic
      const currentlyHoveredNode = [...nodesRef.current].reverse().find((node) =>
      Math.sqrt((worldX - node.x) ** 2 + (worldY - node.y) ** 2) < node.radius
      );

      setHoveredNodeId(currentlyHoveredNode ? currentlyHoveredNode.id : null);

      if (currentlyHoveredNode) {
        canvas.style.cursor = 'pointer';
        // Only show tooltip if NOT in the selection prompt stage.
        if (mapStage !== 'selection_prompt') {
            setTooltip({ show: true, x: mouseX, y: mouseY, text: currentlyHoveredNode.label });
        } else {
            setTooltip((prev) => ({ ...prev, show: false }));
        }
      } else {
        setTooltip((prev) => ({ ...prev, show: false }));
        canvas.style.cursor = 'grab';
      }
    }
  }, [zoom, pan, isPanning, mapStage, showNodeSplit, showMergedView]);

  const handleMouseUp = useCallback(() => {
    if (mapStage === 'node_focus' || showNodeSplit || mapStage === 'emotion_selection' || mapStage === 'belief_intro' || showMergedView) return; // Prevent interaction during focus/split/emotion selection

    nodesRef.current.forEach((node) => {
      node.isDragging = false;
    });
    setIsPanning(false);
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = 'grab'; // Reset cursor
  }, [mapStage, showNodeSplit, showMergedView]);

  const handleMouseLeave = useCallback(() => {
    if (mapStage === 'node_focus' || showNodeSplit || mapStage === 'emotion_selection' || mapStage === 'belief_intro' || showMergedView) return; // Prevent interaction during focus/split/emotion selection
    handleMouseUp(); // This already handles resetting dragging and isPanning
    setHoveredNodeId(null);
    mousePositionRef.current.active = false;
    setTooltip((prev) => ({ ...prev, show: false }));
  }, [handleMouseUp, mapStage, showNodeSplit, showMergedView]);

  const handleWheel = useCallback((e) => {
    if (mapStage === 'node_focus' || showNodeSplit || mapStage === 'emotion_selection' || mapStage === 'belief_intro' || showMergedView) return; // Prevent interaction during focus/split/emotion selection

    handleDismissTutorial();

    e.preventDefault(); // Prevent page scrolling

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left; // Mouse position on canvas (screen coords)
    const mouseY = e.clientY - rect.top;

    const scaleAmount = e.deltaY * -0.001; // Negative deltaY for zoom in on scroll up
    const oldZoom = zoom;
    let newZoom = oldZoom * (1 + scaleAmount); // Scale relative to current zoom level
    newZoom = Math.max(0.1, Math.min(10, newZoom)); // Clamp zoom from 0.1 to 10

    // Calculate new pan to zoom around mouse cursor
    // 1. Get mouse position in world coordinates before zoom
    const worldX = (mouseX - pan.x) / oldZoom;
    const worldY = (mouseY - pan.y) / oldZoom;

    // 2. Calculate new pan so that the world point remains under the mouse
    const newPanX = mouseX - worldX * newZoom;
    const newPanY = mouseY - worldY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [zoom, pan, handleDismissTutorial, mapStage, showNodeSplit, showMergedView]);

  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    if (mapStage === 'node_focus' || showNodeSplit || mapStage === 'emotion_selection' || mapStage === 'belief_intro' || showMergedView) return; // Prevent interaction during focus/split/emotion selection

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (e.touches.length === 2) {
      handleDismissTutorial();
      // Pinch gesture start
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );

      mousePositionRef.current.pinchDistance = distance;
      mousePositionRef.current.isPinching = true;

      // Calculate center point of pinch for zoom origin
      const rect = canvas.getBoundingClientRect();
      const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
      const centerY = (touch1.clientY + touch2.clientY) / 2 - rect.top;
      mousePositionRef.current.pinchCenterWorldX = (centerX - pan.x) / zoom;
      mousePositionRef.current.pinchCenterWorldY = (centerY - pan.y) / zoom;

      setSelectedNodeId(null); // Clear selected node on pinch start
      nodesRef.current.forEach((node) => {node.isDragging = false;}); // Stop any dragging
      setIsPanning(false); // Stop any single-touch panning
      setTooltip((prev) => ({ ...prev, show: false })); // Hide tooltip
    } else
    if (e.touches.length === 1) {
      // Single touch - handle node selection/dragging or start panning
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const mouseX = touch.clientX - rect.left;
      const mouseY = touch.clientY - rect.top;

      // Convert touch screen coordinates to world coordinates
      const worldX = (mouseX - pan.x) / zoom;
      const worldY = (mouseY - pan.y) / zoom;

      const clickedNode = [...nodesRef.current].reverse().find((node) =>
      Math.sqrt((worldX - node.x) ** 2 + (worldY - node.y) ** 2) < node.radius
      );

      if (clickedNode) {
        handleNodeClick(clickedNode);
      } else {
        setSelectedNodeId(null);
        setTooltip((prev) => ({ ...prev, show: false }));
        setIsPanning(true); // Start panning if no node clicked
        lastTouchPos.current = { x: mouseX, y: mouseY }; // Store screen coords for pan delta
      }
    }
  }, [zoom, pan, handleDismissTutorial, handleNodeClick, mapStage, showNodeSplit, showMergedView]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (mapStage === 'node_focus' || showNodeSplit || mapStage === 'emotion_selection' || mapStage === 'belief_intro' || showMergedView) return; // Prevent interaction during focus/split/emotion selection

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (e.touches.length === 2 && mousePositionRef.current.isPinching) {
      // Pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );

      if (mousePositionRef.current.pinchDistance) {
        const oldZoom = zoom;
        const scaleFactor = distance / mousePositionRef.current.pinchDistance;
        let newZoom = oldZoom * scaleFactor;
        newZoom = Math.max(0.1, Math.min(10, newZoom)); // Clamp zoom from 0.1 to 10

        // Adjust pan to keep pinch center stable
        const rect = canvas.getBoundingClientRect();
        const currentPinchCenterX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
        const currentPinchCenterY = (touch1.clientY + touch2.clientY) / 2 - rect.top;

        const newPanX = currentPinchCenterX - mousePositionRef.current.pinchCenterWorldX * newZoom;
        const newPanY = currentPinchCenterY - mousePositionRef.current.pinchCenterWorldY * newZoom;

        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });

        mousePositionRef.current.pinchDistance = distance;
      }
    } else if (e.touches.length === 1) {
      // Single touch - handle dragging or panning
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const mouseX = touch.clientX - rect.left;
      const mouseY = touch.clientY - rect.top;

      const worldX = (mouseX - pan.x) / zoom;
      const worldY = (mouseY - pan.y) / zoom;

      const draggingNode = nodesRef.current.find((node) => node.isDragging);
      if (draggingNode) {
        // Node dragging
        draggingNode.x = worldX;
        draggingNode.y = worldY;
        draggingNode.vx = 0;
        draggingNode.vy = 0;
      } else if (isPanning) {
        // Panning with single touch
        const dx = mouseX - lastTouchPos.current.x;
        const dy = mouseY - lastTouchPos.current.y;
        setPan((prevPan) => ({ x: prevPan.x + dx, y: prevPan.y + dy }));
        lastTouchPos.current = { x: mouseX, y: mouseY };
      }
      // Update tooltip position if active (might be shown for a selected node)
      if (tooltip.show) {
        setTooltip((prev) => ({ ...prev, x: mouseX, y: mouseY }));
      }
    }
  }, [zoom, pan, isPanning, tooltip.show, mapStage, showNodeSplit, showMergedView]);

  const handleTouchEnd = useCallback(() => {
    if (mapStage === 'node_focus' || showNodeSplit || mapStage === 'emotion_selection' || mapStage === 'belief_intro' || showMergedView) return; // Prevent interaction during focus/split/emotion selection

    mousePositionRef.current.isPinching = false;
    mousePositionRef.current.pinchDistance = null;
    mousePositionRef.current.pinchCenterWorldX = null;
    mousePositionRef.current.pinchCenterWorldY = null;

    nodesRef.current.forEach((node) => {
      node.isDragging = false;
    });
    setIsPanning(false);
    setTooltip((prev) => ({ ...prev, show: false })); // Hide tooltip on touch end
  }, [mapStage, showNodeSplit, showMergedView]);

  // Effect for initial setup and image loading
  useEffect(() => {
    // Load images
    const img1 = new Image();
    img1.src = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6bc139e0c_sug1png72.png"; // Changed to 'c' to match actual image path
    
    const img2 = new Image();
    img2.src = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/8433e1aae_72ppi.png"; // Changed to 'e' to match actual image path

    Promise.all([
    new Promise((resolve) => img1.onload = resolve),
    new Promise((resolve) => img2.onload = resolve)]
    ).then(() => {
      setNodeImages({ img1, img2 });
    });
  }, []);

  // Main animation sequence controller
  useEffect(() => {
    let timer;
    if (mapStage === 'loading') {
      timer = setTimeout(() => setMapStage('introToast'), 2500);
    } else if (mapStage === 'introToast') {
      timer = setTimeout(() => setMapStage('tutorial'), 3300);
    } else if (mapStage === 'followUpToast') {
      timer = setTimeout(() => setMapStage('selection_prompt'), 6000);
    } else if (mapStage === 'belief_intro') {
      timer = setTimeout(() => setShowBeliefBuilder(true), 6000); // Keep on screen for 6s
    }
    return () => clearTimeout(timer);
  }, [mapStage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      setCanvasReady(true);
      // Recenter pan on resize to keep content visible
      setPan({ x: 0, y: 0 }); // Resetting pan to 0,0 and zoom to 1 will center the *canvas* on 0,0 world point
      setZoom(1);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Prevent scrolling on the page
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      document.body.style.overflow = 'auto'; // Reset overflow
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!canvasReady) return;

    const animate = (time) => {
      simulate();
      render(time);
      animationRef.current = requestAnimationFrame(animate);
    };

    // Animation should always run; physics and rendering logic adapt based on mapStage.
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [simulate, render, canvasReady, mapStage]);

  useEffect(() => {
    if (!canvasReady || pathways.length === 0 || nodesRef.current.length > 0 || !nodeImages.img1) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    nodesRef.current = pathways.map((pathway, index) => {
      const nodeType = 'Seed'; // Initially, all experiences are seeds
      const image = nodeImages.img1; // Seeds use the first image type

      return {
        id: index,
        label: pathway,
        x: centerX + (Math.random() - 0.5) * 500,
        y: centerY + (Math.random() - 0.5) * 300,
        vx: (Math.random() - 0.5) * 2, // Added small random initial velocity
        vy: (Math.random() - 0.5) * 2, // Added small random initial velocity
        radius: 50, // Increased for better collision detection and larger, clearer images
        isDragging: false,
        type: nodeType,
        image: image
      };
    });
  }, [pathways, canvasReady, nodeImages]);

  const selectedNode = selectedNodeId !== null ? nodesRef.current.find((n) => n.id === selectedNodeId) : null;
  const notificationText = pathways.length > 1 ? "First experiences created." : "First experience created.";

  return (
    <div className="w-screen h-screen fixed inset-0 overflow-hidden select-none" style={{ backgroundColor: '#000000' }}>
      <AnimatePresence>
        {mapStage === 'loading' &&
        <motion.img
          src="https://raw.githubusercontent.com/gefen1998/Svgs/refs/heads/main/static%20background.svg"
          alt="Neural network background"
          className="absolute inset-0 z-0 w-full h-full object-cover"
          style={{
            imageRendering: 'crisp-edges',
            imageRendering: '-webkit-optimize-contrast'
          }}
          initial={{ opacity: 0, x: 0, y: 0 }}
          animate={{
            opacity: 1,
            x: [0, 6, -4, 5, -2, 0],
            y: [0, -4, 6, -2, 4, 0],
            transition: {
              opacity: { duration: 1 },
              x: { duration: 12, repeat: Infinity, ease: "easeInOut" },
              y: { duration: 16, repeat: Infinity, ease: "easeInOut" }
            }
          }}
          exit={{
            opacity: 0,
            filter: 'blur(8px) grayscale(80%)',
            transition: { duration: 0.6, ease: 'easeOut' }
          }} />

        }
      </AnimatePresence>

      <div className="absolute top-4 left-4 z-10">
        <Link to={createPageUrl('SelectPathways')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors bg-black bg-opacity-30 px-3 py-1 rounded">
          <ArrowLeft size={16} />
          <span>Back</span>
        </Link>
      </div>

      {/* Logic to display one or two info boxes during split selection */}
      {selectedNode && !splitSelection.second && (mapStage !== 'interactive' || showMergedView) && (
          <SelectedNodeInfo
              node={selectedNode}
              onClose={() => setSelectedNodeId(null)}
              side={infoBoxSide}
              splitSelection={splitSelection}
              isBeliefSide={false}
          />
      )}
      {selectedNode && splitSelection.second && (
          <>
              <SelectedNodeInfo
                  node={selectedNode}
                  onClose={() => {}} // No-op for the event side box
                  side={splitSelection.first}
                  splitSelection={splitSelection}
                  isBeliefSide={false}
                  hideCloseButton={true}
              />
              <SelectedNodeInfo
                  node={selectedNode}
                  onClose={() => setSelectedNodeId(null)}
                  side={splitSelection.second}
                  splitSelection={splitSelection}
                  isBeliefSide={true}
              />
          </>
      )}
       {/* Original logic for when not in split selection mode, just dragging a node */}
      {selectedNode && mapStage === 'interactive' && !showMergedView && (
        <SelectedNodeInfo node={selectedNode} onClose={() => setSelectedNodeId(null)} side={infoBoxSide} splitSelection={splitSelection} />
      )}


      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />

      <AnimatePresence>
        {tooltip.show && !selectedNode &&
        <motion.div
          className="absolute pointer-events-none bg-black bg-opacity-75 text-white text-sm px-3 py-2 rounded z-30 shadow-lg border border-gray-600"
          style={{
            left: tooltip.x + 15,
            top: tooltip.y + 15
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}>
          
            <div className="font-semibold">{tooltip.text}</div>
          </motion.div>
        }
      </AnimatePresence>
      
      <NodeTypesLegend />
      
      {/* Experience Added Notification */}
      <AnimatePresence>
        {mapStage === 'introToast' && (
          <div className="fixed bottom-8 left-0 right-0 flex justify-center pointer-events-none z-20">
            <motion.div
              className="bg-black bg-opacity-70 text-white text-lg border border-gray-800 rounded-lg shadow-lg px-6 py-3 pointer-events-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5 }}
            >
              {notificationText}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Tutorial Overlay */}
      <AnimatePresence>
        {mapStage === 'tutorial' && (
          <div className="fixed top-8 left-0 right-0 flex justify-center pointer-events-none z-30">
            <motion.div
              className="bg-black/60 backdrop-blur-sm text-gray-300 text-sm px-5 py-3 rounded-lg shadow-lg border border-gray-700 pointer-events-auto"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, transition: { duration: 0.3 } }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-x-4">
                  <div className="flex items-center gap-1.5">
                      <Hand size={14} /> <span>drag to explore</span>
                  </div>
                  <div className="h-4 w-px bg-gray-600" />
                  <div className="flex items-center gap-1.5">
                      <ZoomIn size={14} /> <span>pinch to zoom</span>
                  </div>
                  <div className="h-4 w-px bg-gray-600" />
                  <div className="flex items-center gap-1.5">
                      <MousePointerClick size={14} /> <span>tap for more</span>
                  </div>
                  <div className="h-4 w-px bg-gray-600" />
                  <button
                    onClick={handleDismissTutorial}
                    className="text-gray-400 hover:text-white text-sm whitespace-nowrap"
                  >
                    Skip
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">(Tap a node or pinch to zoom to continue)</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Follow-up Message */}
      <AnimatePresence>
        {mapStage === 'followUpToast' && (
          <div className="fixed bottom-8 left-0 right-0 flex justify-center pointer-events-none z-20">
            <motion.div
              className="bg-black bg-opacity-70 text-white text-lg border border-gray-800 rounded-lg shadow-lg px-6 py-3 pointer-events-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5 }}
            >
              {pathways.length === 1 
                ? "A new experience is on your map — You don’t know yet what belief it created." 
                : "New experiences are on your map — You don’t know yet what beliefs they created."
              }
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Tap a node / Emotion Prompt Message */}
      <AnimatePresence>
        {(mapStage === 'selection_prompt' || (mapStage === 'emotion_selection' && !selectedEmotion)) && (
          <div className="fixed bottom-8 left-0 right-0 flex justify-center pointer-events-none z-20">
            <motion.div
              className="bg-black bg-opacity-70 text-white text-lg border border-gray-800 rounded-lg shadow-lg px-6 py-3 pointer-events-auto"
              key={mapStage === 'emotion_selection' ? 'emotion_message' : 'selection_message'} // Use different keys to ensure re-animation on mapStage change
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5 }}
            >
              {mapStage === 'emotion_selection' ? bottomMessage : 'Tap a node to continue'}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Node Focus Message */}
      <AnimatePresence>
        {mapStage === 'node_focus' && !showNodeSplit && (
          <div className="fixed bottom-8 left-0 right-0 flex justify-center pointer-events-none z-20">
            <motion.div
              className="bg-black bg-opacity-70 text-white text-lg border border-gray-800 rounded-lg shadow-lg px-6 py-3 pointer-events-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ 
                duration: 0.5, 
                delay: 0.5 
              }}
            >
              Let's see what this experience means to you.
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Node Split Overlay - Modified to handle merge animation */}
      <AnimatePresence>
        {showNodeSplit && focusedNode && !showMergedView && (() => {
          const visualDiameter = focusedNode.radius * 2 * zoom;
          const visualRadius = visualDiameter / 2;
          const isEmotionSelection = mapStage === 'emotion_selection';
          const beliefSide = splitSelection.beliefSide;

          return (
            <motion.div
              className="fixed inset-0 flex items-center justify-center pointer-events-none z-25"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
            >
              <div 
                className="relative pointer-events-auto flex items-center justify-center"
                style={{
                  width: `${visualDiameter}px`,
                  height: `${visualDiameter}px`,
                }}
              >
                {/* Left half - "What Happened" */}
                <motion.div
                  className="absolute inset-0 rounded-full border-2 transition-all duration-200 flex items-center justify-center text-center"
                  style={{
                    clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0 100%)',
                    borderColor: '#888888',
                    backgroundColor: 'rgba(180, 180, 180, 0.4)',
                    cursor: isEmotionSelection ? 'default' : 'pointer',
                  }}
                  initial={{ scale: 0 }}
                  animate={{ 
                    scale: 1, 
                    opacity: isEmotionSelection && beliefSide === 'right' ? 0.3 : 1 
                  }}
                  transition={{ scale: { duration: 0.4, delay: 0.2 }, opacity: {duration: 0.4} }}
                  whileHover={(!splitSelection.first || (splitSelection.first === 'right' && !splitSelection.second)) && !isEmotionSelection ? { scale: 1.05, backgroundColor: 'rgba(180, 180, 180, 0.6)' } : {}}
                  onClick={() => !isEmotionSelection && handleHalfClick('left')}
                >
                  <AnimatePresence>
                    {/* Display "The event as it happened." when left is the first click and no second click yet */}
                    {splitSelection.first === 'left' && !splitSelection.second && (
                      <motion.div
                        className="absolute flex items-center justify-center text-center"
                        style={{
                          left: `${visualRadius * 0.25}px`,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: `${visualRadius * 0.7}px`,
                          height: `${visualRadius * 0.6}px`,
                          backgroundColor: 'rgba(31, 31, 30, 0.7)',
                          backdropFilter: 'blur(5px)',
                          borderRadius: '18px',
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <span className="text-white font-normal px-2 leading-snug" style={{ fontSize: `${Math.max(14, visualRadius * 0.08)}px` }}>
                          The event <br/>as it happened.
                        </span>
                      </motion.div>
                    )}
                    {/* Display "Belief formed because of it." when left is the second click */}
                    {splitSelection.second === 'left' && (
                      <motion.div
                        className="absolute flex items-center justify-center text-center"
                        style={{
                          left: `${visualRadius * 0.25}px`,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: `${visualRadius * 0.7}px`,
                          height: `${visualRadius * 0.6}px`,
                          backgroundColor: 'rgba(31, 31, 30, 0.7)',
                          backdropFilter: 'blur(5px)',
                          borderRadius: '18px',
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <span className="text-white font-normal px-2 leading-snug" style={{ fontSize: `${Math.max(14, visualRadius * 0.08)}px` }}>
                          Belief formed<br/>because of it.
                        </span>
                      </motion.div>
                    )}
                    {/* Show "The event as it happened" when this was the first click and second click happened (on the other side) */}
                    {splitSelection.first === 'left' && splitSelection.second && splitSelection.second !== 'left' && (
                      <motion.div
                        className="absolute flex items-center justify-center text-center"
                        style={{
                          left: `${visualRadius * 0.25}px`,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: `${visualRadius * 0.7}px`,
                          height: `${visualRadius * 0.6}px`,
                          backgroundColor: 'rgba(31, 31, 30, 0.7)',
                          backdropFilter: 'blur(5px)',
                          borderRadius: '18px',
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                        initial={{ opacity: 1, scale: 1 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        <span className="text-white font-normal px-2 leading-snug" style={{ fontSize: `${Math.max(14, visualRadius * 0.08)}px` }}>
                          The event <br/>as it happened.
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Right half - "Belief Formed" */}
                <motion.div
                  className="absolute inset-0 rounded-full border-2 transition-all duration-200 flex items-center justify-center text-center"
                  style={{
                    clipPath: 'polygon(50% 0, 100% 0, 100% 100%, 50% 100%)',
                    borderColor: '#888888',
                    backgroundColor: 'rgba(80, 80, 80, 0.3)',
                    cursor: isEmotionSelection ? 'default' : 'pointer',
                  }}
                  initial={{ scale: 0 }}
                  animate={{ 
                    scale: 1, 
                    opacity: isEmotionSelection && beliefSide === 'left' ? 0.3 : 1 
                  }}
                  transition={{ scale: { duration: 0.4, delay: 0.2 }, opacity: {duration: 0.4} }}
                  whileHover={(!splitSelection.first || (splitSelection.first === 'left' && !splitSelection.second)) && !isEmotionSelection ? { scale: 1.05, backgroundColor: 'rgba(100, 100, 100, 0.5)' } : {}}
                  onClick={() => !isEmotionSelection && handleHalfClick('right')}
                >
                  <AnimatePresence>
                    {/* Display "The event as it happened." when right is the first click and no second click yet */}
                    {splitSelection.first === 'right' && !splitSelection.second && (
                      <motion.div
                        className="absolute flex items-center justify-center text-center"
                        style={{
                          right: `${visualRadius * 0.25}px`,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: `${visualRadius * 0.7}px`,
                          height: `${visualRadius * 0.6}px`,
                          backgroundColor: 'rgba(31, 31, 30, 0.7)',
                          backdropFilter: 'blur(5px)',
                          borderRadius: '18px',
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <span className="text-white font-normal px-2 leading-snug" style={{ fontSize: `${Math.max(14, visualRadius * 0.08)}px` }}>
                          The event <br/>as it happened.
                        </span>
                      </motion.div>
                    )}
                    {/* Display "Belief formed because of it." when right is the second click */}
                    {splitSelection.second === 'right' && (
                      <motion.div
                        className="absolute flex items-center justify-center text-center"
                        style={{
                          right: `${visualRadius * 0.25}px`,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: `${visualRadius * 0.7}px`,
                          height: `${visualRadius * 0.6}px`,
                          backgroundColor: 'rgba(31, 31, 30, 0.7)',
                          backdropFilter: 'blur(5px)',
                          borderRadius: '18px',
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <span className="text-white font-normal px-2 leading-snug" style={{ fontSize: `${Math.max(14, visualRadius * 0.08)}px` }}>
                          Belief formed<br/>because of it.
                        </span>
                      </motion.div>
                    )}
                    {/* Show "The event as it happened" when this was the first click and second click happened (on the other side) */}
                    {splitSelection.first === 'right' && splitSelection.second && splitSelection.second !== 'right' && (
                      <motion.div
                        className="absolute flex items-center justify-center text-center"
                        style={{
                          right: `${visualRadius * 0.25}px`,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: `${visualRadius * 0.7}px`,
                          height: `${visualRadius * 0.6}px`,
                          backgroundColor: 'rgba(31, 31, 30, 0.7)',
                          backdropFilter: 'blur(5px)',
                          borderRadius: '18px',
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                        initial={{ opacity: 1, scale: 1 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        <span className="text-white font-normal px-2 leading-snug" style={{ fontSize: `${Math.max(14, visualRadius * 0.08)}px` }}>
                          The event <br/>as it happened.
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
                
                {/* Center divider line */}
                <motion.div
                  className="absolute top-0 w-px bg-white bg-opacity-30"
                  style={{
                    left: '50%',
                    transform: 'translateX(-50%)',
                    height: '100%',
                  }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.3, delay: 0.6 }}
                />
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
      
      {/* New Merged View */}
      <AnimatePresence>
        {showMergedView && focusedNode && completedBelief && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center pointer-events-none z-25"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
          >
            <motion.div
              className="relative pointer-events-auto flex flex-col items-center justify-center"
              style={{
                width: `${focusedNode.radius * 2 * zoom}px`,
                height: `${focusedNode.radius * 2 * zoom}px`,
              }}
            >
              {/* Merged circular background */}
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-white border-opacity-60 flex items-center justify-center text-center"
                style={{
                  backgroundColor: 'rgba(180, 180, 180, 0.3)',
                }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 1, ease: "easeOut" }}
              >
                <div
                  className="absolute flex flex-col items-center justify-center text-center px-4"
                  style={{
                    width: '90%',
                    height: '90%',
                  }}
                >
                  <div
                    className="bg-black bg-opacity-70 backdrop-blur-sm rounded-2xl p-4 border border-white border-opacity-20"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                    }}
                  >
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.8, delay: 0.5 }}
                      className="space-y-3"
                    >
                      <div className="text-[#E1C15C] text-xs font-semibold tracking-wider uppercase">
                        The Belief
                      </div>
                      <div className="text-white text-sm font-medium leading-tight">
                        {completedBelief.fullSentence}
                      </div>
                      
                      <div className="border-t border-gray-600 pt-3 mt-3">
                        <div className="text-[#E1C15C] text-xs font-semibold tracking-wider uppercase">
                          The Event
                        </div>
                        <div className="text-white text-sm font-medium leading-tight mt-1">
                          {focusedNode.label.startsWith("Other - ") 
                            ? `${focusedNode.label.replace("Other - ", "")} Related Experience`
                            : focusedNode.label
                          }
                        </div>
                        <div className="text-[#E1C15C] text-xs mt-1">
                          Seed Experience
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
            
            {/* Confirmation message below the node */}
            <motion.div
              className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-white text-lg"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1 }}
            >
              This experience is now whole.
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emotion Wheel */}
      {mapStage === 'emotion_selection' && emotions.length > 0 && focusedNode && showNodeSplit && (
        <EmotionWheel
          emotions={emotions}
          onSelect={setSelectedEmotion}
          selectedEmotion={selectedEmotion}
          beliefSide={splitSelection.beliefSide}
          nodeDiameter={focusedNode.radius * 2 * zoom}
        />
      )}

      {/* Belief Builder */}
      {showBeliefBuilder && selectedEmotion && focusedNode && (
        <BeliefBuilder
          selectedEmotion={selectedEmotion}
          onComplete={handleBeliefComplete}
          nodeDiameter={focusedNode.radius * 2 * zoom}
        />
      )}

      {/* Continue button after emotion selection */}
      <AnimatePresence>
        {selectedEmotion && mapStage === 'emotion_selection' && (
          <div className="fixed bottom-[72px] left-0 right-0 flex justify-center z-40">
            <motion.button
              onClick={handleContinueAfterEmotion}
              className="btn-base btn-primary"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5 }}
            >
              Continue
            </motion.button>
          </div>
        )}
      </AnimatePresence>


      {/* Split Visualization Guidance Message */}
      <AnimatePresence>
        {showNodeSplit && !splitSelection.first && (
          <div className="fixed bottom-8 left-0 right-0 flex justify-center pointer-events-none z-20">
            <motion.div
              className="bg-black bg-opacity-70 text-white text-lg border border-gray-800 rounded-lg shadow-lg px-6 py-3 pointer-events-auto text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5 }}
            >
              Each side holds a piece of your story. Pick one.
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* "Tap the other side" Message */}
      <AnimatePresence>
        {showTapOtherSideMessage && (
          <div className="fixed bottom-8 left-0 right-0 flex justify-center pointer-events-none z-20">
            <motion.div
              className="bg-black bg-opacity-70 text-white text-lg border border-gray-800 rounded-lg shadow-lg px-6 py-3 pointer-events-auto text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5 }}
            >
              When you're ready - tap to uncover the other side.
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Belief Intro Message */}
      <AnimatePresence>
        {mapStage === 'belief_intro' && !completedBelief && (
          <div className="fixed bottom-28 left-0 right-0 flex justify-center pointer-events-none z-20">
            <motion.div
              className="bg-black bg-opacity-70 text-white text-lg border border-gray-800 rounded-lg shadow-lg px-6 py-3 pointer-events-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5, delay: 1 }}
            >
              Got it. The feeling you chose shapes a belief — begin by choosing how it starts.
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Completed Belief Message */}
      <AnimatePresence>
        {completedBelief && !showMergedView && (
          <div className="fixed bottom-8 left-0 right-0 flex justify-center pointer-events-none z-20">
            <motion.div
              className="bg-black bg-opacity-70 text-white text-lg border border-gray-800 rounded-lg shadow-lg px-6 py-3 pointer-events-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5 }}
            >
              {completedBelief.fullSentence}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Zoom indicator */}
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 border border-gray-700 px-3 py-1 text-white text-sm rounded z-20">
        Zoom: {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
