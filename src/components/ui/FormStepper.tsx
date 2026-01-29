import React from 'react';
import { Check } from 'lucide-react';

interface FormStepperProps {
    steps: { label: string }[];
    currentStep: number;
    className?: string;
    onStepClick?: (step: number) => void;
}

export function FormStepper({ steps, currentStep, className = '', onStepClick }: FormStepperProps) {
    return (
        <div className={`flex items-center justify-between mb-8 px-2 py-2 overflow-x-auto scrollbar-hide ${className}`}>
            {steps.map((step, index) => {
                const stepNumber = index + 1;
                const isCompleted = currentStep > stepNumber;
                const isCurrent = currentStep === stepNumber;
                const isPending = currentStep < stepNumber;

                return (
                    <div key={stepNumber} className="flex items-center min-w-fit">
                        {/* Step Circle */}
                        <div
                            onClick={() => onStepClick?.(stepNumber)}
                            className={`
                w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all flex-shrink-0 cursor-default
                ${isCompleted || isCurrent
                                    ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20'
                                    : 'bg-gray-100 text-gray-400'}
                ${isCurrent ? 'scale-110 ring-4 ring-brand-primary/10' : ''}
                ${onStepClick && isCompleted ? 'cursor-pointer hover:bg-brand-primary-dark' : ''}
            `}>
                            {isCompleted ? <Check size={14} strokeWidth={4} /> : stepNumber}
                        </div>

                        {/* Step Label */}
                        <span className={`
                ml-3 text-[10px] font-black uppercase tracking-wider hidden sm:block whitespace-nowrap
                ${isCompleted || isCurrent ? 'text-gray-900' : 'text-gray-300'}
            `}>
                            {step.label}
                        </span>

                        {/* Connecting Line */}
                        {index < steps.length - 1 && (
                            <div className={`w-8 sm:w-12 h-0.5 mx-2 sm:mx-4 transition-all duration-500 ${isCompleted ? 'bg-brand-primary/30' : 'bg-gray-100'}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
