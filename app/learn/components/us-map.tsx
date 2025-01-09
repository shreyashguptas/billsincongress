'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

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
  WV: { name: 'West Virginia', representatives: 2, abbreviation: 'WV' }
};

interface USMapProps {
  onStateHover: (state: StateData | null) => void;
}

export default function USMap({ onStateHover }: USMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [statePosition, setStatePosition] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [tooltipPosition, setTooltipPosition] = useState<'top' | 'bottom'>('top');
  const objectRef = useRef<HTMLObjectElement>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // Calculate totals
  const totalRepresentatives = Object.values(statesData).reduce((sum, state) => sum + state.representatives, 0);
  const totalSenators = Object.keys(statesData).length * 2; // 2 senators per state

  // Calculate max representatives once
  const maxRepresentatives = Math.max(...Object.values(statesData).map(s => s.representatives));

  const getStateColor = useCallback((stateAbbr: string) => {
    if (!statesData[stateAbbr]) {
      console.warn(`No data found for state: ${stateAbbr}`);
      return '#d3d3d3';
    }

    // Calculate opacity based on representatives
    const reps = statesData[stateAbbr].representatives;
    // Adjust the scale to make the differences more visible
    const opacity = (reps / maxRepresentatives) * 0.9 + 0.1;
    
    // Use a darker base purple color for better visibility
    const baseColor = hoveredState === stateAbbr
      ? [147, 51, 234]  // Brighter purple when hovered
      : [124, 58, 237]; // Base purple

    return hoveredState === stateAbbr
      ? `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, ${opacity})`
      : `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, ${opacity * 0.8})`; // Less transparent for better visibility
  }, [hoveredState]);

  const handleStateHover = useCallback((stateAbbr: string | null, pathElement?: SVGPathElement) => {
    setHoveredState(stateAbbr);
    if (stateAbbr && statesData[stateAbbr] && pathElement) {
      const bbox = pathElement.getBBox();
      const svg = pathElement.ownerSVGElement;
      if (svg) {
        const point = svg.createSVGPoint();
        point.x = bbox.x + bbox.width / 2;
        point.y = bbox.y;
        const screenPoint = point.matrixTransform(svg.getScreenCTM() || new DOMMatrix());
        const rect = svg.getBoundingClientRect();
        
        // Calculate if tooltip should appear above or below the state
        const yPosition = bbox.y / svg.viewBox.baseVal.height * 100;
        setTooltipPosition(yPosition < 30 ? 'bottom' : 'top');
        
        setStatePosition({
          x: (bbox.x + bbox.width / 2) / svg.viewBox.baseVal.width * 100,
          y: bbox.y / svg.viewBox.baseVal.height * 100,
          width: bbox.width / svg.viewBox.baseVal.width * 100,
          height: bbox.height / svg.viewBox.baseVal.height * 100
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

      const svg = obj.contentDocument?.querySelector('svg');
      if (!svg) {
        console.error('SVG element not found in the object');
        return;
      }

      if (!svg.getAttribute('viewBox')) {
        const width = svg.getAttribute('width') || '959';
        const height = svg.getAttribute('height') || '593';
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      }

      const style = document.createElement('style');
      style.textContent = `
        path { 
          fill: #d3d3d3; 
          stroke: #ffffff; 
          stroke-width: 0.75;
          stroke-miterlimit: 4;
          stroke-dasharray: none;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          transform-origin: center;
          mix-blend-mode: multiply;
        }
        path:hover { 
          cursor: pointer;
          transform: scale(1.02) translateY(-4px);
          filter: brightness(1.1);
          z-index: 10;
          mix-blend-mode: normal;
        }
        .state-label { 
          font-family: ui-sans-serif, system-ui, sans-serif; 
          font-size: 12px; 
          fill: #4b5563;
          pointer-events: none;
          text-anchor: middle;
        }
      `;
      svg.appendChild(style);

      // Debug: Log all states and their colors
      console.log('Initializing state colors:');
      
      const paths = svg.querySelectorAll('path');
      paths.forEach(path => {
        const stateId = path.getAttribute('id');
        if (stateId) {
          if (statesData[stateId]) {
            const color = getStateColor(stateId);
            path.style.fill = color;
            console.log(`State ${stateId}: ${statesData[stateId].representatives} reps, color: ${color}`);
            
            path.addEventListener('mouseenter', () => handleStateHover(stateId, path));
            path.addEventListener('mouseleave', () => handleStateHover(null));
            path.addEventListener('touchstart', (e) => {
              e.preventDefault();
              handleStateHover(stateId, path);
            });
          } else {
            console.warn(`Missing data for state: ${stateId}`);
          }
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
    }

    return () => {
      obj?.removeEventListener('load', initializeMap);
    };
  }, [getStateColor, handleStateHover]);

  useEffect(() => {
    if (!isMapLoaded || !objectRef.current) return;

    const svg = objectRef.current.contentDocument?.querySelector('svg');
    if (!svg) return;

    const paths = svg.querySelectorAll('path');
    paths.forEach(path => {
      const stateId = path.getAttribute('id');
      if (stateId && statesData[stateId]) {
        path.style.fill = getStateColor(stateId);
      }
    });
  }, [isMapLoaded, getStateColor]);

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      {/* Total counts display */}
      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 p-3 text-sm">
        <div className="font-medium text-gray-900 mb-2">Congress Totals</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-gray-500 mb-1">House</div>
            <div className="font-bold text-lg">{totalRepresentatives}</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Senate</div>
            <div className="font-bold text-lg">{totalSenators}</div>
          </div>
        </div>
      </div>

      <div className="aspect-[16/10] relative bg-gray-50 rounded-lg shadow-inner p-4">
        <object
          ref={objectRef}
          data="/images/us-map.svg"
          type="image/svg+xml"
          className="w-full h-full"
        />
        
        {/* State info overlay */}
        {hoveredState && statesData[hoveredState] && (
          <div 
            className="absolute pointer-events-none"
            style={{
              left: `${statePosition.x}%`,
              top: `${statePosition.y}%`,
              transform: tooltipPosition === 'top' 
                ? 'translate(-50%, -120%)' 
                : 'translate(-50%, 20%)',
              zIndex: 50,
            }}
          >
            <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 p-3 min-w-[180px]">
              <h3 className="font-bold text-gray-900 text-lg border-b border-gray-100 pb-2 mb-2">
                {statesData[hoveredState].name}
              </h3>
              <div className="grid gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">House Representatives</span>
                  <span className="font-semibold text-lg ml-4">{statesData[hoveredState].representatives}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Senators</span>
                  <span className="font-semibold text-lg ml-4">2</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 