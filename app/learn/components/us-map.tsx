'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';

interface StateData {
  name: string;
  representatives: number;
  abbreviation: string;
}

const statesData: { [key: string]: StateData } = {
  CA: { name: 'California', representatives: 52, abbreviation: 'CA' },
  TX: { name: 'Texas', representatives: 38, abbreviation: 'TX' },
  FL: { name: 'Florida', representatives: 28, abbreviation: 'FL' },
  NY: { name: 'New York', representatives: 26, abbreviation: 'NY' },
  IL: { name: 'Illinois', representatives: 17, abbreviation: 'IL' },
  PA: { name: 'Pennsylvania', representatives: 17, abbreviation: 'PA' },
  OH: { name: 'Ohio', representatives: 15, abbreviation: 'OH' },
  GA: { name: 'Georgia', representatives: 14, abbreviation: 'GA' },
  NC: { name: 'North Carolina', representatives: 14, abbreviation: 'NC' },
  MI: { name: 'Michigan', representatives: 13, abbreviation: 'MI' },
  NJ: { name: 'New Jersey', representatives: 12, abbreviation: 'NJ' },
  VA: { name: 'Virginia', representatives: 11, abbreviation: 'VA' },
  WA: { name: 'Washington', representatives: 10, abbreviation: 'WA' },
  AZ: { name: 'Arizona', representatives: 9, abbreviation: 'AZ' },
  MA: { name: 'Massachusetts', representatives: 9, abbreviation: 'MA' },
  TN: { name: 'Tennessee', representatives: 9, abbreviation: 'TN' },
  IN: { name: 'Indiana', representatives: 9, abbreviation: 'IN' },
  MD: { name: 'Maryland', representatives: 8, abbreviation: 'MD' },
  MO: { name: 'Missouri', representatives: 8, abbreviation: 'MO' },
  WI: { name: 'Wisconsin', representatives: 8, abbreviation: 'WI' },
  CO: { name: 'Colorado', representatives: 8, abbreviation: 'CO' },
  SC: { name: 'South Carolina', representatives: 7, abbreviation: 'SC' },
  AL: { name: 'Alabama', representatives: 7, abbreviation: 'AL' },
  KY: { name: 'Kentucky', representatives: 6, abbreviation: 'KY' },
  LA: { name: 'Louisiana', representatives: 6, abbreviation: 'LA' },
  OK: { name: 'Oklahoma', representatives: 5, abbreviation: 'OK' },
  CT: { name: 'Connecticut', representatives: 5, abbreviation: 'CT' },
  OR: { name: 'Oregon', representatives: 6, abbreviation: 'OR' },
  AR: { name: 'Arkansas', representatives: 4, abbreviation: 'AR' },
  KS: { name: 'Kansas', representatives: 4, abbreviation: 'KS' },
  NV: { name: 'Nevada', representatives: 4, abbreviation: 'NV' },
  UT: { name: 'Utah', representatives: 4, abbreviation: 'UT' },
  NM: { name: 'New Mexico', representatives: 3, abbreviation: 'NM' },
  NE: { name: 'Nebraska', representatives: 3, abbreviation: 'NE' },
  ID: { name: 'Idaho', representatives: 2, abbreviation: 'ID' },
  NH: { name: 'New Hampshire', representatives: 2, abbreviation: 'NH' },
  ME: { name: 'Maine', representatives: 2, abbreviation: 'ME' },
  HI: { name: 'Hawaii', representatives: 2, abbreviation: 'HI' },
  RI: { name: 'Rhode Island', representatives: 2, abbreviation: 'RI' },
  MT: { name: 'Montana', representatives: 2, abbreviation: 'MT' },
  DE: { name: 'Delaware', representatives: 1, abbreviation: 'DE' },
  SD: { name: 'South Dakota', representatives: 1, abbreviation: 'SD' },
  ND: { name: 'North Dakota', representatives: 1, abbreviation: 'ND' },
  AK: { name: 'Alaska', representatives: 1, abbreviation: 'AK' },
  VT: { name: 'Vermont', representatives: 1, abbreviation: 'VT' },
  WY: { name: 'Wyoming', representatives: 1, abbreviation: 'WY' },
  WV: { name: 'West Virginia', representatives: 2, abbreviation: 'WV' },
  MN: { name: 'Minnesota', representatives: 8, abbreviation: 'MN' },
  IA: { name: 'Iowa', representatives: 4, abbreviation: 'IA' },
  MS: { name: 'Mississippi', representatives: 4, abbreviation: 'MS' }
};

interface USMapProps {
  onStateHover: (state: StateData | null) => void;
}

export default function USMap({ onStateHover }: USMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [statePosition, setStatePosition] = useState({ x: 0, y: 0 });
  const objectRef = useRef<HTMLObjectElement>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // Calculate totals - using actual data from statesData
  const totalRepresentatives = Object.values(statesData).reduce((sum, state) => sum + state.representatives, 0);
  const totalSenators = Object.keys(statesData).length * 2; // 2 senators per state

  const getStateColor = useCallback((stateAbbr: string) => {
    if (!statesData[stateAbbr]) {
      console.warn(`No data found for state: ${stateAbbr}`);
      return '#d3d3d3';
    }

    const reps = statesData[stateAbbr].representatives;
    const maxReps = Math.max(...Object.values(statesData).map(s => s.representatives));
    const opacity = (reps / maxReps) * 0.9 + 0.1;
    
    return hoveredState === stateAbbr
      ? `rgba(124, 58, 237, ${opacity})`
      : `rgba(124, 58, 237, ${opacity * 0.7})`;
  }, [hoveredState]);

  const handleStateHover = useCallback((stateAbbr: string | null, pathElement?: SVGPathElement) => {
    setHoveredState(stateAbbr);
    if (stateAbbr && statesData[stateAbbr] && pathElement) {
      const bbox = pathElement.getBBox();
      const svg = pathElement.ownerSVGElement;
      if (svg) {
        const svgRect = svg.getBoundingClientRect();
        const stateX = bbox.x + bbox.width / 2;
        const stateY = bbox.y + bbox.height / 2;
        
        setStatePosition({
          x: (stateX / svg.viewBox.baseVal.width) * 100,
          y: (stateY / svg.viewBox.baseVal.height) * 100
        });
      }
      onStateHover(statesData[stateAbbr]);
    } else {
      onStateHover(null);
    }
  }, [onStateHover]);

  useEffect(() => {
    const initializeMap = () => {
      const obj = objectRef.current;
      if (!obj) return;

      const doc = obj.contentDocument;
      if (!doc) {
        console.warn('SVG document not loaded');
        return;
      }

      const svg = doc.querySelector('svg');
      if (!svg) {
        console.error('SVG element not found in the object');
        return;
      }

      // Set SVG to fill container while maintaining aspect ratio
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

      // Ensure viewBox is set
      if (!svg.getAttribute('viewBox')) {
        svg.setAttribute('viewBox', '0 0 959 593');
      }

      svg.style.backgroundColor = 'transparent';
      
      // Add styles directly to SVG document
      const style = doc.createElement('style');
      style.textContent = `
        path { 
          fill: #1f2937;
          stroke: rgba(139, 92, 246, 0.3);
          stroke-width: 1;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          transform-origin: center;
          opacity: 0.8;
          cursor: pointer;
        }
        path:hover { 
          transform: scale(1.02);
          filter: brightness(1.3);
          stroke: rgb(167, 139, 250);
          stroke-width: 2;
          opacity: 1;
        }
      `;
      svg.appendChild(style);

      const paths = svg.querySelectorAll('path');
      paths.forEach((path: SVGPathElement) => {
        const stateId = path.getAttribute('id');
        if (stateId && statesData[stateId]) {
          path.style.fill = getStateColor(stateId);
          
          const handleEnter = () => handleStateHover(stateId, path);
          const handleLeave = () => handleStateHover(null);
          
          path.addEventListener('mouseenter', handleEnter);
          path.addEventListener('mouseleave', handleLeave);
          path.addEventListener('touchstart', (e: Event) => {
            e.preventDefault();
            handleEnter();
          });
        } else if (stateId) {
          console.warn(`Missing data for state: ${stateId}`);
          path.style.fill = '#1f2937';
        }
      });

      setIsMapLoaded(true);
    };

    const obj = objectRef.current;
    if (obj) {
      if (obj.contentDocument?.readyState === 'complete') {
        initializeMap();
      } else {
        obj.addEventListener('load', initializeMap);
      }

      // Retry mechanism for production
      let retryCount = 0;
      const maxRetries = 3;
      const retryInterval = setInterval(() => {
        if (isMapLoaded || retryCount >= maxRetries) {
          clearInterval(retryInterval);
          return;
        }
        if (obj.contentDocument?.readyState === 'complete') {
          initializeMap();
        }
        retryCount++;
      }, 1000);

      return () => {
        clearInterval(retryInterval);
        obj.removeEventListener('load', initializeMap);
      };
    }
  }, [getStateColor, handleStateHover, isMapLoaded]);

  return (
    <div className="w-full py-12">
      {/* Title and Description */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-4">
          How many Representatives and Senators are there?
        </h1>
        <p className="text-lg text-gray-400 max-w-3xl mx-auto">
          Each state has a number of representatives based on its population, while every state has exactly two senators,
          regardless of population.
        </p>
      </div>

      {/* Congress Totals */}
      <div className="max-w-2xl mx-auto mb-16">
        <div className="grid grid-cols-2">
          <div className="text-center">
            <div className="text-purple-300 text-xl font-medium mb-2">House</div>
            <div className="font-bold text-7xl text-purple-400 mb-2">{totalRepresentatives}</div>
            <div className="text-purple-300">Representatives</div>
          </div>
          <div className="text-center">
            <div className="text-purple-300 text-xl font-medium mb-2">Senate</div>
            <div className="font-bold text-7xl text-purple-400 mb-2">{totalSenators}</div>
            <div className="text-purple-300">Senators</div>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="max-w-6xl mx-auto relative">
        <object
          ref={objectRef}
          data="/images/us-map.svg"
          type="image/svg+xml"
          className="w-full h-auto"
          style={{ minHeight: '500px' }}
          aria-label="US Map showing congressional representation"
        >
          {/* Fallback for production */}
          <img 
            src="/images/us-map.svg" 
            alt="US Map showing congressional representation"
            className="w-full h-auto"
          />
        </object>
        
        {/* State info tooltip */}
        {hoveredState && statesData[hoveredState] && (
          <div 
            className="absolute pointer-events-none"
            style={{
              left: `${statePosition.x}%`,
              top: `${statePosition.y}%`,
              transform: 'translate(-50%, -130%)',
              zIndex: 50,
            }}
          >
            <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl shadow-xl border border-purple-800/50 p-4 min-w-[220px]">
              <h3 className="font-bold text-white text-xl mb-3 text-center">
                {statesData[hoveredState].name}
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-gray-800/50 p-2 rounded-lg">
                  <span className="text-purple-300">Representatives</span>
                  <span className="font-bold text-2xl text-purple-400 ml-3">
                    {statesData[hoveredState].representatives}
                  </span>
                </div>
                <div className="flex justify-between items-center bg-gray-800/50 p-2 rounded-lg">
                  <span className="text-purple-300">Senators</span>
                  <span className="font-bold text-2xl text-purple-400 ml-3">2</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 