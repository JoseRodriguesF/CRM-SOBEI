const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

exports.listUnits = async (req, res) => {
  try {
    const units = await prisma.unit.findMany({
      include: { company: true },
      orderBy: { id: 'asc' },
    });
    return res.json(units);
  } catch (err) {
    console.error('Erro ao listar unidades:', err);
    return res.status(500).json({ error: 'Erro ao listar unidades.' });
  }
};

exports.createUnit = async (req, res) => {
  try {
    const { name, cnpj, contracts, address, companyCnpj, companyName } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nome da unidade é obrigatório.' });
    }

    if (!companyCnpj || !companyCnpj.trim()) {
      return res.status(400).json({ error: 'CNPJ da empresa (matriz) é obrigatório.' });
    }

    let company = await prisma.company.findUnique({
      where: { cnpj: companyCnpj.trim() },
    });

    if (!company) {
      company = await prisma.company.create({
        data: {
          cnpj: companyCnpj.trim(),
          name: (companyName || `Empresa ${companyCnpj}`).trim(),
        },
      });
    }

    const unit = await prisma.unit.create({
      data: {
        name: name.trim(),
        code: name.trim().toUpperCase().slice(0, 32),
        cnpj: cnpj?.trim() || null,
        address: address?.trim() || null,
        contracts: contracts?.trim() || null,
        companyId: company.id,
      },
      include: { company: true },
    });

    return res.status(201).json(unit);
  } catch (err) {
    console.error('Erro ao criar unidade:', err);
    return res.status(500).json({ error: 'Erro ao criar unidade.' });
  }
};

exports.updateUnit = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, cnpj, contracts, address } = req.body;

    const existing = await prisma.unit.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'Unidade não encontrada.' });
    }

    const unit = await prisma.unit.update({
      where: { id: Number(id) },
      data: {
        name: name?.trim() ?? existing.name,
        code: (name?.trim() ?? existing.name).toUpperCase().slice(0, 32),
        cnpj: cnpj !== undefined ? (cnpj?.trim() || null) : existing.cnpj,
        address: address !== undefined ? (address?.trim() || null) : existing.address,
        contracts: contracts !== undefined ? (contracts?.trim() || null) : existing.contracts,
      },
      include: { company: true },
    });

    return res.json(unit);
  } catch (err) {
    console.error('Erro ao atualizar unidade:', err);
    return res.status(500).json({ error: 'Erro ao atualizar unidade.' });
  }
};

exports.deleteUnit = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.unit.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'Unidade não encontrada.' });
    }

    // Desvincula as faturas antes de deletar
    await prisma.invoice.updateMany({
      where: { unitId: Number(id) },
      data: { unitId: null },
    });

    await prisma.unit.delete({ where: { id: Number(id) } });

    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao deletar unidade:', err);
    return res.status(500).json({ error: 'Erro ao deletar unidade.' });
  }
};
