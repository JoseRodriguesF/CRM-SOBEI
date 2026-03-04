import React, { useState } from 'react';
import { IMaskInput } from 'react-imask';

/**
 * Input controlado para adicionar e remover múltiplos CNPJs (como tags).
 */
export function MultiCnpjInput({ cnpjs = [], onChange }) {
    const [inputValue, setInputValue] = useState('');

    const addCnpj = () => {
        if (!inputValue) return;

        if (!cnpjs.includes(inputValue)) {
            onChange([...cnpjs, inputValue]);
        }
        setInputValue('');
    };

    const removeCnpj = (index) => {
        const newCnpjs = [...cnpjs];
        newCnpjs.splice(index, 1);
        onChange(newCnpjs);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCnpj();
        }
    };

    return (
        <div className="multi-cnpj-wrapper">
            <div className="multi-cnpj-tags">
                {cnpjs.length === 0 && <span className="cnpj-tag-empty">Nenhum CNPJ adicionado</span>}
                {cnpjs.map((cnpj, idx) => (
                    <div key={`${cnpj}-${idx}`} className="cnpj-tag">
                        <span className="cnpj-tag-text">{cnpj}</span>
                        <button type="button" className="cnpj-tag-remove" onClick={() => removeCnpj(idx)}>×</button>
                    </div>
                ))}
            </div>
            <div className="multi-cnpj-input-row">
                <IMaskInput
                    mask="00.000.000/0000-00"
                    className="field-input"
                    placeholder="00.000.000/0000-00"
                    value={inputValue}
                    onAccept={(val) => setInputValue(val)}
                    onKeyDown={handleKeyDown}
                />
                <button type="button" className="btn btn-outline-sm" onClick={addCnpj}>
                    Adicionar
                </button>
            </div>
        </div>
    );
}
