const API_URL = import.meta.env.VITE_API_URL;

async function request(path, options = {}) {
    const headers = { ...options.headers };

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });

    const contentType = res.headers.get('content-type') ?? '';
    const data = contentType.includes('application/json')
        ? await res.json()
        : await res.text();

    if (!res.ok) {
        const message = data?.details || data?.error || data || 'Erro na requisição';
        throw new Error(message);
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

        services: {
            list: (unitId) => request(`/units/${unitId}/services`),
            create: (unitId, data) => request(`/units/${unitId}/services`, { method: 'POST', body: JSON.stringify(data) }),
            update: (unitId, serviceId, data) => request(`/units/${unitId}/services/${serviceId}`, { method: 'PUT', body: JSON.stringify(data) }),
            delete: (unitId, serviceId) => request(`/units/${unitId}/services/${serviceId}`, { method: 'DELETE' }),
        },
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
            return request('/invoices/upload', { method: 'POST', body: formData });
        },
        delete: (id) => request(`/invoices/${id}`, { method: 'DELETE' }),
        updateStatus: (id, status, paidDate = null) =>
            request(`/invoices/${id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status, paidDate })
            }),
                dashboard: (params = {}) => {
            const qs = new URLSearchParams(params).toString();
            return request(`/invoices/dashboard?${qs}`);
        },
    },
};
