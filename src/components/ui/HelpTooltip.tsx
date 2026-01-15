'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface HelpTooltipProps {
    text: string | ReactNode;
    side?: 'top' | 'bottom' | 'left' | 'right';
    className?: string;
}

export function HelpTooltip({ text, side = 'top', className = '' }: HelpTooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLButtonElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout>(undefined);

    useEffect(() => {
        setMounted(true);
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    // Handle click outside to close on mobile/desktop tap
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            // Check if click is outside trigger
            const triggerClicked = triggerRef.current && triggerRef.current.contains(event.target as Node);

            // We can't easily check if click is inside portal content here without another ref, 
            // but the portal is removed on outside mousedown usually anyway or handled by the toggle.
            // For simplicity, if we click outside the trigger, we close.
            // However, we need to be careful not to close if clicking INSIDE the portal.
            // Since the portal is at body level, we'd need a ref to the portal content.
            // But typically, clicking helps toggle.

            if (!triggerClicked) {
                // We rely on the fact that interacting with the tooltip text usually doesn't require clicking it.
                // If the user clicks elsewhere, we want to close.
                // We'll set a small timeout or just let `onMouseLeave` handle it for desktop.
                // For mobile tap:
            }
        }
        // document.addEventListener('mousedown', handleClickOutside);
        // return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const updatePosition = () => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();

        let top = 0;
        let left = 0;

        switch (side) {
            case 'top':
                top = rect.top;
                left = rect.left + rect.width / 2;
                break;
            case 'bottom':
                top = rect.bottom;
                left = rect.left + rect.width / 2;
                break;
            case 'left':
                top = rect.top + rect.height / 2;
                left = rect.left;
                break;
            case 'right':
                top = rect.top + rect.height / 2;
                left = rect.right;
                break;
        }

        setCoords({ top, left });
    };

    useEffect(() => {
        if (isVisible) {
            updatePosition();
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
            return () => {
                window.removeEventListener('scroll', updatePosition, true);
                window.removeEventListener('resize', updatePosition);
            };
        }
    }, [isVisible, side]);

    const handleEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        updatePosition();
        setIsVisible(true);
    };

    const handleLeave = () => {
        timeoutRef.current = setTimeout(() => {
            setIsVisible(false);
        }, 150); // 150ms grace period to move from trigger to tooltip
    };

    const toggleVisibility = () => {
        if (isVisible) {
            handleLeave();
        } else {
            handleEnter();
        }
    };

    // Portal content styling
    const tooltipClasses = {
        top: '-translate-x-1/2 -translate-y-full -mt-2',
        bottom: '-translate-x-1/2 mt-2',
        left: '-translate-x-full -translate-y-1/2 -ml-2',
        right: '-translate-y-1/2 ml-2',
    };

    const arrowClasses = {
        top: 'bottom-[-5px] left-1/2 -translate-x-1/2 border-b border-r',
        bottom: 'top-[-5px] left-1/2 -translate-x-1/2 border-t border-l',
        left: 'right-[-5px] top-1/2 -translate-y-1/2 border-t border-r',
        right: 'left-[-5px] top-1/2 -translate-y-1/2 border-b border-l',
    };

    const tooltipContent = mounted && isVisible ? createPortal(
        <div
            className={`fixed z-[9999] w-[90vw] md:w-80 max-w-[90vw] bg-gray-900 border border-gray-700 text-gray-100 text-xs rounded-lg p-3 shadow-xl ${tooltipClasses[side]}`}
            style={{ top: coords.top, left: coords.left }}
            role="tooltip"
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
        >
            {text}
            {/* Arrow */}
            <div
                className={`absolute w-2 h-2 bg-gray-900 border-gray-700 rotate-45 ${arrowClasses[side]}`}
            ></div>
        </div>,
        document.body
    ) : null;

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className={`relative inline-flex items-center justify-center text-gray-400 hover:text-white transition-colors focus:outline-none focus:text-white p-1 ${className}`}
                onClick={toggleVisibility}
                onMouseEnter={handleEnter}
                onMouseLeave={handleLeave}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleVisibility();
                    }
                }}
                aria-label="Help"
                aria-expanded={isVisible}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm11.378-3.917c-.89-.777-2.366-.777-3.255 0a.75.75 0 01-.988-1.129c1.454-1.272 3.776-1.272 5.23 0 1.513 1.324 1.513 3.518 0 4.842a3.75 3.75 0 01-.837.552c-.676.328-1.028.774-1.028 1.152v.202a.75.75 0 001.5 0v-.008c0-.022.01-.064.127-.145a2.25 2.25 0 00.501-.33c1.036-.906 1.036-2.528 0-3.435zM12 15a.75.75 0 100 1.5.75.75 0 000-1.5z" clipRule="evenodd" />
                </svg>
            </button>
            {tooltipContent}
        </>
    );
}
