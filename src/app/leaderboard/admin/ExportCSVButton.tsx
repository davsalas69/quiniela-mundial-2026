'use client';

import React, { useState } from 'react';
import { exportPlayersCSVAction } from '@/app/actions';
import { FileSpreadsheet, Loader2 } from 'lucide-react';

export default function ExportCSVButton() {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const csv = await exportPlayersCSVAction();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `quiniela_posiciones_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to export CSV:', err);
      alert('Error al exportar el archivo CSV.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="inline-flex items-center space-x-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 shadow-lg shadow-emerald-950/20 cursor-pointer"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="h-4 w-4" />
      )}
      <span>{loading ? 'Exportando...' : 'Exportar CSV'}</span>
    </button>
  );
}
