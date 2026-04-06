import React from 'react';
import { Check } from 'lucide-react';

/**
 * @param {Array} steps - Array of strings (labels)
 * @param {Number} currentStep - 1-indexed current step
 * @param {Function} setStep - Function to change step
 * @param {Array} completedSteps - Array of 1-indexed completed step numbers
 */
export default function Stepper({ steps, currentStep, setStep, completedSteps = [] }) {
  return (
    <div className="stepper">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = currentStep === stepNumber;
        const isCompleted = completedSteps.includes(stepNumber);
        
        return (
          <div 
            key={index} 
            className={`step-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
            onClick={() => setStep(stepNumber)}
          >
            <div className="step-indicator">
              {isCompleted && <Check size={14} className="mr-1 inline" />}
              <span>{label}</span>
            </div>
          </div>
        );

      })}
    </div>
  );
}
