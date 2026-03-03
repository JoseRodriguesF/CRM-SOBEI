import { useEffect, useState } from 'react';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL;

function App() {
  const [file, setFile] = useState(null);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [filters, setFilters] = useState({
    cnpj: '',
    status: '',
    month: '',
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const [emailData, setEmailData] = useState({
    to: '',
    subject: '',
  });
  const [dashboard, setDashboard] = useState(null);

  async function fetchInvoices() {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (filters.cnpj) params.append('cnpj', filters.cnpj);
      if (filters.status) params.append('status', filters.status);
      if (filters.month) params.append('month', filters.month);

      const res = await fetch(`${API_URL}/invoices?${params.toString()}`);
      const data = await res.json();
      setInvoices(data);
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar faturas.');
    } finally {
      setLoadingList(false);
    }
  }

  async function fetchDashboard() {
    try {
      const res = await fetch(`${API_URL}/invoices/dashboard`);
      const data = await res.json();
      setDashboard(data);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    fetchInvoices();
    fetchDashboard();
  }, []);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) {
      alert('Selecione um PDF primeiro.');
      return;
    }
    setLoadingUpload(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_URL}/invoices/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro no upload');
      }

      await fetchInvoices();
      await fetchDashboard();
      setFile(null);
      e.target.reset();
      alert('Fatura enviada e processada com sucesso.');
    } catch (error) {
      console.error(error);
      alert('Erro ao enviar fatura: ' + error.message);
    } finally {
      setLoadingUpload(false);
    }
  }

  function toggleSelect(id) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  async function handleSendEmail(e) {
    e.preventDefault();
    if (!selectedIds.length) {
      alert('Selecione ao menos uma fatura.');
      return;
    }
    if (!emailData.to) {
      alert('Informe o e-mail de destino.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/invoices/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceIds: selectedIds,
          ...emailData,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao enviar e-mail');
      }
      alert('E-mail enviado com sucesso.');
    } catch (error) {
      console.error(error);
      alert('Erro ao enviar e-mail: ' + error.message);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              CRM Faturas Vivo Empresas
            </h1>
            <p className="text-sm text-slate-400">
              Upload de faturas em PDF, extração automática por IA e controle de
              status por CNPJ e unidade.
            </p>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="col-span-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-medium text-slate-200">
              Upload de fatura (PDF)
            </h2>
            <form
              onSubmit={handleUpload}
              className="flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <label className="flex-1 cursor-pointer rounded-lg border border-dashed border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-300 hover:border-sky-500 hover:bg-slate-900/90">
                <span className="block text-xs font-medium text-slate-400">
                  Selecione o arquivo PDF
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="mt-1 block w-full text-xs text-slate-300 file:mr-4 file:rounded-md file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-sky-500"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button
                type="submit"
                disabled={loadingUpload}
                className="mt-2 inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-0"
              >
                {loadingUpload ? 'Processando...' : 'Enviar PDF'}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-medium text-slate-200">
              Visão geral
            </h2>
            {dashboard ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Total de faturas</span>
                  <span className="font-semibold">{dashboard.totalInvoices}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Valor total</span>
                  <span className="font-semibold">
                    R$ {Number(dashboard.totalAmount || 0).toFixed(2)}
                  </span>
                </div>
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium text-slate-400">
                    Por status
                  </p>
                  {dashboard.byStatus?.map((item) => (
                    <div
                      key={item.status}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="uppercase text-slate-400">
                        {item.status}
                      </span>
                      <span className="font-semibold">{item._count._all}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Carregando informações...
              </p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">
                  CNPJ
                </label>
                <input
                  type="text"
                  value={filters.cnpj}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, cnpj: e.target.value }))
                  }
                  placeholder="00.000.000/0000-00"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">
                  Mês de referência
                </label>
                <input
                  type="text"
                  value={filters.month}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, month: e.target.value }))
                  }
                  placeholder="MM/AAAA"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, status: e.target.value }))
                  }
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="">Todos</option>
                  <option value="PAGA">Paga</option>
                  <option value="PENDENTE">Pendente</option>
                  <option value="ATRASADA">Atrasada</option>
                </select>
              </div>
            </div>
            <button
              onClick={fetchInvoices}
              className="mt-2 inline-flex items-center justify-center rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-white md:mt-0"
            >
              {loadingList ? 'Atualizando...' : 'Aplicar filtros'}
            </button>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-800">
            <div className="max-h-[420px] overflow-auto">
              <table className="min-w-full divide-y divide-slate-800 text-sm">
                <thead className="bg-slate-900/80">
                  <tr>
                    <th className="w-8 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                      Sel.
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                      CNPJ
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                      Empresa / Unidade
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                      Mês
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                      Vencimento
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                      Valor
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                      Status
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-400">
                      PDF
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-900/60">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(inv.id)}
                          onChange={() => toggleSelect(inv.id)}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-slate-300">
                        {inv.cnpj}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="font-medium text-slate-100">
                          {inv.company?.name}
                        </div>
                        <div className="text-slate-500">
                          {inv.unit?.name || '-'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-200">
                        {inv.referenceMonth}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-300">
                        {new Date(inv.dueDate).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold text-slate-100">
                        R$ {Number(inv.totalAmount).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            inv.status === 'PAGA'
                              ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40'
                              : inv.status === 'ATRASADA'
                              ? 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/40'
                              : 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/40'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        <a
                          href={`${API_URL.replace('/api', '')}/${inv.pdfPath}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 hover:text-sky-300"
                        >
                          Abrir
                        </a>
                      </td>
                    </tr>
                  ))}
                  {!invoices.length && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-3 py-8 text-center text-sm text-slate-500"
                      >
                        Nenhuma fatura encontrada. Faça o upload de um PDF ou
                        ajuste os filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-medium text-slate-200">
            Enviar e-mail com faturas selecionadas
          </h2>
          <form
            onSubmit={handleSendEmail}
            className="grid gap-3 sm:grid-cols-[2fr,2fr,auto]"
          >
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">
                Para (e-mail)
              </label>
              <input
                type="email"
                value={emailData.to}
                onChange={(e) =>
                  setEmailData((d) => ({ ...d, to: e.target.value }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="contas@empresa.com.br"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">
                Assunto
              </label>
              <input
                type="text"
                value={emailData.subject}
                onChange={(e) =>
                  setEmailData((d) => ({ ...d, subject: e.target.value }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="Faturas Vivo Empresas"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!selectedIds.length}
              >
                Enviar e-mail
              </button>
            </div>
          </form>
          <p className="text-xs text-slate-500">
            O sistema anexará automaticamente os PDFs das faturas selecionadas e
            incluirá um resumo com valores e lista de pendentes/atrasadas.
          </p>
        </section>
      </div>
    </div>
  );
}

export default App;
