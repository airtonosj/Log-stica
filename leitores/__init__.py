# -*- coding: utf-8 -*-
"""Leitores de planilhas do ERP — sem dependências externas.

xlsx_raw  lê .xlsx (SpreadsheetML) direto do zip; openpyxl não abre os arquivos
          exportados por este ERP (quebra no stylesheet).
xls_biff  lê .xls legado (OLE/BIFF8) do formulário de orçamento.
"""
