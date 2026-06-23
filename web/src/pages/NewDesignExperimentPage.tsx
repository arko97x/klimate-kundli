export function NewDesignExperimentPage() {
  return (
    <div className="h-screen w-full bg-white flex items-center justify-center p-0 md:p-6 overflow-hidden relative font-sans">
      {/* A4 Paper Div centered, covering entire screen height */}
      <div className="h-full max-h-full max-w-full aspect-[210/297] bg-white border border-black flex flex-col relative select-none">
        
        {/* Top Folded Square Area (occupies W x W space) */}
        <div className="w-full aspect-square relative bg-white border-b border-black">
          
          {/* North Indian Kundli / Fortune Teller Crease Pattern */}
          <svg
            viewBox="0 0 600 600"
            className="w-full h-full text-black stroke-black fill-none"
            style={{ strokeLinecap: 'round', strokeLinejoin: 'round' }}
          >
            {/* Diagonals */}
            <line x1="0" y1="0" x2="600" y2="600" stroke="black" strokeWidth="1.2" />
            <line x1="600" y1="0" x2="0" y2="600" stroke="black" strokeWidth="1.2" />

            {/* Inner Diamond */}
            <line x1="300" y1="0" x2="600" y2="300" stroke="black" strokeWidth="1.2" />
            <line x1="600" y1="300" x2="300" y2="600" stroke="black" strokeWidth="1.2" />
            <line x1="300" y1="600" x2="0" y2="300" stroke="black" strokeWidth="1.2" />
            <line x1="0" y1="300" x2="300" y2="0" stroke="black" strokeWidth="1.2" />

            {/* Corner Fold Boundaries (W/4 Squares) */}
            {/* Top-Left */}
            <line x1="150" y1="0" x2="150" y2="150" stroke="black" strokeWidth="1.2" />
            <line x1="0" y1="150" x2="150" y2="150" stroke="black" strokeWidth="1.2" />

            {/* Top-Right */}
            <line x1="450" y1="0" x2="450" y2="150" stroke="black" strokeWidth="1.2" />
            <line x1="450" y1="150" x2="600" y2="150" stroke="black" strokeWidth="1.2" />

            {/* Bottom-Left */}
            <line x1="150" y1="450" x2="150" y2="600" stroke="black" strokeWidth="1.2" />
            <line x1="0" y1="450" x2="150" y2="450" stroke="black" strokeWidth="1.2" />

            {/* Bottom-Right */}
            <line x1="450" y1="450" x2="450" y2="600" stroke="black" strokeWidth="1.2" />
            <line x1="450" y1="450" x2="600" y2="450" stroke="black" strokeWidth="1.2" />

            {/* Astrological / Crease Arcs (Radius 85, Centered at the 4 midpoints of the outer square edges) */}
            {/* Top Middle Center (300, 0) */}
            <path d="M 215 0 A 85 85 0 0 0 239.9 60.1" stroke="black" strokeWidth="1.2" />
            <path d="M 385 0 A 85 85 0 0 1 360.1 60.1" stroke="black" strokeWidth="1.2" />

            {/* Left Middle Center (0, 300) */}
            <path d="M 0 215 A 85 85 0 0 1 60.1 239.9" stroke="black" strokeWidth="1.2" />
            <path d="M 0 385 A 85 85 0 0 0 60.1 360.1" stroke="black" strokeWidth="1.2" />

            {/* Right Middle Center (600, 300) */}
            <path d="M 600 215 A 85 85 0 0 0 539.9 239.9" stroke="black" strokeWidth="1.2" />
            <path d="M 600 385 A 85 85 0 0 1 539.9 360.1" stroke="black" strokeWidth="1.2" />

            {/* Bottom Middle Center (300, 600) */}
            <path d="M 215 600 A 85 85 0 0 1 239.9 539.9" stroke="black" strokeWidth="1.2" />
            <path d="M 385 600 A 85 85 0 0 0 360.1 539.9" stroke="black" strokeWidth="1.2" />
          </svg>
        </div>

        {/* Bottom leftover strip of the A4 page (since width is folded to form a square) */}
        <div className="w-full flex-1 bg-white relative" />

      </div>
    </div>
  )
}
