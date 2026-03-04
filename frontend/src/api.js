const API_URL = import.meta.env.VITE_API_URL;

async function request(path, options = {}) {
    const headers = { ...options.headers };

    // Só adiciona JSON se não for FormData e não tiver sido definido manualmente
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    } else if (headers['Content-Type'] === 'undefined') {
        delete headers['Content-Type'];
    }

    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
    });

    const contentType = res.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
        data = await res.json();
    } else {
        data = await res.text();
    }

    if (!res.ok) {
        const error = (data && data.error) || data || 'Erro na requisição';
        throw new Error(error);
    }

    return data;
}

export const api = {
    // Unidades
    units: {
        list: () => request('/units'),
        create: (data) => request('/units', { method: 'POST', body: JSON.stringify(data) }),
        update: (id, data) => request(`/units/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        delete: (id) => request(`/units/${id}`, { method: 'DELETE' }),

        // Serviços aninhados
        services: {
            list: (unitId) => request(`/units/${unitId}/services`),
            create: (unitId, data) => request(`/units/${unitId}/services`, { method: 'POST', body: JSON.stringify(data) }),
            update: (unitId, serviceId, data) => request(`/units/${unitId}/services/${serviceId}`, { method: 'PUT', body: JSON.stringify(data) }),
            delete: (unitId, serviceId) => request(`/units/${unitId}/services/${serviceId}`, { method: 'DELETE' }),
        }
    },

    // Faturas
    invoices: {
        list: (params = {}) => {
            const qs = new URLSearchParams(params).toString();
            return request(`/invoices?${qs}`);
        },
        upload: (file) => {
            const formData = new FormData();
            formData.append('file', file);
            return request('/invoices/upload', {
                method: 'POST',
                // Deixamos vazio para o fetch lidar com FormData automaticamente
                body: formData,
            });
        },
        delete: (id) => request(`/invoices/${id}`, { method: 'DELETE' }),
        updateStatus: (id, status) => request(`/invoices/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
        sendEmail: (data) => request('/invoices/send-email', { method: 'POST', body: JSON.stringify(data) }),
        dashboard: (params = {}) => {
            const qs = new URLSearchParams(params).toString();
            return request(`/invoices/dashboard?${qs}`);
        }
    }
};
