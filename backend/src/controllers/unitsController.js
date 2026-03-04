const prisma = require('../lib/prisma');
const { parseCnpjs, serializeCnpjs } = require('../lib/cnpjUtils');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Serializa o campo cnpjs de volta para array antes de enviar ao cliente. */
function formatUnit(unit) {
  return { ...unit, cnpjs: parseCnpjs(unit.cnpjs) };
}

// ─── Units CRUD ───────────────────────────────────────────────────────────────

exports.listUnits = async (req, res) => {
  try {
    const units = await prisma.unit.findMany({
      include: {
        company: true,
        services: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { id: 'asc' },
    });
    return res.json(units.map(formatUnit));
  } catch (err) {
    console.error('[units] listUnits:', err);
    return res.status(500).json({ error: 'Erro ao listar unidades.' });
  }
};

exports.createUnit = async (req, res) => {
  try {
    const { name, cnpjs, address, companyCnpj, companyName } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Nome da unidade é obrigatório.' });
    }
    if (!companyCnpj?.trim()) {
      return res.status(400).json({ error: 'CNPJ da empresa (matriz) é obrigatório.' });
    }

    // Encontra ou cria a empresa
    const company = await prisma.company.upsert({
      where: { cnpj: companyCnpj.trim() },
      update: {},
      create: {
        cnpj: companyCnpj.trim(),
        name: (companyName || `Empresa ${companyCnpj}`).trim(),
      },
    });

    const unit = await prisma.unit.create({
      data: {
        name: name.trim(),
        code: name.trim().toUpperCase().slice(0, 32),
        cnpjs: serializeCnpjs(parseCnpjs(cnpjs)),
        address: address?.trim() || null,
        companyId: company.id,
      },
      include: { company: true, services: true },
    });

    return res.status(201).json(formatUnit(unit));
  } catch (err) {
    console.error('[units] createUnit:', err);
    return res.status(500).json({ error: 'Erro ao criar unidade.' });
  }
};

exports.updateUnit = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, cnpjs, address } = req.body;

    const existing = await prisma.unit.findUnique({ where: { id: Number(id) } });
    if (!existing) return res.status(404).json({ error: 'Unidade não encontrada.' });

    const newName = name?.trim() ?? existing.name;

    const unit = await prisma.unit.update({
      where: { id: Number(id) },
      data: {
        name: newName,
        code: newName.toUpperCase().slice(0, 32),
        cnpjs: cnpjs !== undefined ? serializeCnpjs(parseCnpjs(cnpjs)) : existing.cnpjs,
        address: address !== undefined ? (address?.trim() || null) : existing.address,
      },
      include: { company: true, services: { orderBy: { createdAt: 'asc' } } },
    });

    return res.json(formatUnit(unit));
  } catch (err) {
    console.error('[units] updateUnit:', err);
    return res.status(500).json({ error: 'Erro ao atualizar unidade.' });
  }
};

exports.deleteUnit = async (req, res) => {
  try {
    const { id } = req.params;
    const unitId = Number(id);

    const existing = await prisma.unit.findUnique({ where: { id: unitId } });
    if (!existing) return res.status(404).json({ error: 'Unidade não encontrada.' });

    // Desvincula faturas e remove serviços antes de deletar a unidade
    await prisma.$transaction([
      prisma.invoice.updateMany({
        where: { unitId },
        data: { unitId: null, serviceId: null },
      }),
      prisma.service.deleteMany({ where: { unitId } }),
      prisma.unit.delete({ where: { id: unitId } }),
    ]);

    return res.json({ success: true });
  } catch (err) {
    console.error('[units] deleteUnit:', err);
    return res.status(500).json({ error: 'Erro ao deletar unidade.' });
  }
};

// ─── Services CRUD (aninhado em unidade) ─────────────────────────────────────

async function requireUnit(unitId, res) {
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) {
    res.status(404).json({ error: 'Unidade não encontrada.' });
    return null;
  }
  return unit;
}

exports.listServices = async (req, res) => {
  try {
    const unitId = Number(req.params.unitId);
    if (!(await requireUnit(unitId, res))) return;

    const services = await prisma.service.findMany({
      where: { unitId },
      orderBy: { createdAt: 'asc' },
    });
    return res.json(services);
  } catch (err) {
    console.error('[services] listServices:', err);
    return res.status(500).json({ error: 'Erro ao listar serviços.' });
  }
};

exports.createService = async (req, res) => {
  try {
    const unitId = Number(req.params.unitId);
    const { name, contractNumber } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'Nome do serviço é obrigatório.' });
    if (!contractNumber?.trim()) return res.status(400).json({ error: 'Número do contrato é obrigatório.' });

    if (!(await requireUnit(unitId, res))) return;

    const service = await prisma.service.create({
      data: { name: name.trim(), contractNumber: contractNumber.trim(), unitId },
    });
    return res.status(201).json(service);
  } catch (err) {
    console.error('[services] createService:', err);
    return res.status(500).json({ error: 'Erro ao criar serviço.' });
  }
};

exports.updateService = async (req, res) => {
  try {
    const unitId = Number(req.params.unitId);
    const serviceId = Number(req.params.serviceId);
    const { name, contractNumber } = req.body;

    const existing = await prisma.service.findFirst({ where: { id: serviceId, unitId } });
    if (!existing) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const service = await prisma.service.update({
      where: { id: serviceId },
      data: {
        name: name?.trim() ?? existing.name,
        contractNumber: contractNumber?.trim() ?? existing.contractNumber,
      },
    });
    return res.json(service);
  } catch (err) {
    console.error('[services] updateService:', err);
    return res.status(500).json({ error: 'Erro ao atualizar serviço.' });
  }
};

exports.deleteService = async (req, res) => {
  try {
    const unitId = Number(req.params.unitId);
    const serviceId = Number(req.params.serviceId);

    const existing = await prisma.service.findFirst({ where: { id: serviceId, unitId } });
    if (!existing) return res.status(404).json({ error: 'Serviço não encontrado.' });

    await prisma.$transaction([
      prisma.invoice.updateMany({ where: { serviceId }, data: { serviceId: null } }),
      prisma.service.delete({ where: { id: serviceId } }),
    ]);

    return res.json({ success: true });
  } catch (err) {
    console.error('[services] deleteService:', err);
    return res.status(500).json({ error: 'Erro ao deletar serviço.' });
  }
};
