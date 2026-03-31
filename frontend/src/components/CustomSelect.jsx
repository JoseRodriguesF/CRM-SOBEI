import { useState, useRef, useEffect } from 'react';

/**
 * Componente de seleção estilizado que substitui o <select> nativo.
 */
export function CustomSelect({ options, value, onChange, placeholder = 'Selecione...' }) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    const selectedOption = options.find((opt) => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={`custom-select ${isOpen ? 'custom-select--active' : ''}`} ref={containerRef}>
            <div className="select-trigger" onClick={() => setIsOpen(prev => !prev)}>
                <span>{selectedOption ? selectedOption.label : placeholder}</span>
                <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>
            {isOpen && (
                <div className="select-options">
                    {options.map((opt) => (
                        <div
                            key={opt.value}
                            className={`select-option ${value === opt.value ? 'select-option--selected' : ''}`}
                            onClick={() => { onChange(opt.value); setIsOpen(false); }}
                        >
                            {opt.label}
                            {value === opt.value && <span>✓</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
