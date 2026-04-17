import React from 'react';

interface CircularProgressProps {
  size: number;
  strokeWidth: number;
  percentages: number[];
  colors: string[];
}

const CircularProgress: React.FC<CircularProgressProps> = ({ 
  size, 
  strokeWidth, 
  percentages, 
  colors 
}) => {
  const radius = (size - strokeWidth) / 2;
  
  const getStrokeDashoffset = (percentage: number, currentCircumference: number) => {
    return currentCircumference - (percentage / 100) * currentCircumference;
  };

  // Calculate display value: if single percentage, show it; if multiple, multiply them (for OEE)
  const displayValue = percentages.length === 1 
    ? percentages[0] 
    : percentages.reduce((a, b) => (a * b) / 100, 100);

  return (
    <svg width={size} height={size} className="overflow-visible">
      {/* Background circle */}
      <circle
        stroke="#e5e7eb"
        fill="transparent"
        strokeWidth={strokeWidth}
        r={radius}
        cx={size / 2}
        cy={size / 2}
        strokeLinecap="round"
      />
      
      {/* Progress circles */}
      {percentages.map((percentage, index) => {
        const currentRadius = radius - index * (strokeWidth + 5);
        const currentCircumference = 2 * Math.PI * currentRadius;

        if (percentage === 0) {
          return null;
        }

        return (
          <circle
            key={index}
            stroke={colors[index % colors.length]}
            fill="transparent"
            strokeWidth={strokeWidth}
            r={currentRadius}
            cx={size / 2}
            cy={size / 2}
            strokeDasharray={currentCircumference}
            strokeDashoffset={getStrokeDashoffset(percentage, currentCircumference)}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="transition-all duration-1000 ease-out"
          />
        );
      })}
      
      {/* Value text */}
      <text
        x="50%" 
        y="50%" 
        dominantBaseline="middle" 
        textAnchor="middle" 
        fontSize="24" 
        fill="currentColor"
        className="text-gray-800 dark:text-white font-bold"
      >
        {Math.round(displayValue)}
      </text>
    </svg>
  );
};

export default CircularProgress;
