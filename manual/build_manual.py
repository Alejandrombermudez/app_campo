# -*- coding: utf-8 -*-
"""Genera el Manual de usuario de App Campo (PDF) con las capturas de img/.

Uso (desde app_campo/manual):
  1. node servidor_manual.mjs      (o la entrada «app_campo-manual» de .claude/launch.json)
  2. node capturas.mjs             (rehace img/ con datos de ejemplo)
  3. python build_manual.py        (escribe Manual_Usuario_App_Campo.pdf)

Los predios y personas de las capturas son inventados. Fuentes: Poppins y Fraunces
(las de la app, convertidas a TTF en fuentes/, licencia OFL).
"""
import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Image, Table, TableStyle,
    ListFlowable, ListItem, PageBreak, KeepTogether, NextPageTemplate,
)

AQUI = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(AQUI, "img")
OUT = os.path.join(AQUI, "Manual_Usuario_App_Campo.pdf")
FUENTES = os.path.join(AQUI, "fuentes")

for nombre, archivo in [("Poppins", "poppins-latin-400-normal.ttf"), ("Poppins-Semi", "poppins-latin-600-normal.ttf"),
                        ("Poppins-Bold", "poppins-latin-700-normal.ttf"), ("Fraunces", "fraunces-latin-soft-normal.ttf")]:
    pdfmetrics.registerFont(TTFont(nombre, os.path.join(FUENTES, archivo)))
pdfmetrics.registerFontFamily("Poppins", normal="Poppins", bold="Poppins-Bold", italic="Poppins", boldItalic="Poppins-Bold")

# Paleta del Manual de Identidad 2024 (la misma de la app)
BOSQUE = colors.HexColor("#2f3f32")
BOSQUE_2 = colors.HexColor("#3d5141")
AMBAR = colors.HexColor("#e1a644")
HUESO = colors.HexColor("#f4efe6")
HUESO_2 = colors.HexColor("#ebe5d9")
TEXTO = colors.HexColor("#2a2622")
TENUE = colors.HexColor("#6f675d")
LINEA = colors.HexColor("#d9d1c3")
AMBAR_SUAVE = colors.HexColor("#f8ecd4")

PAGE_W, PAGE_H = letter
MARGEN = 0.75 * inch
ANCHO = PAGE_W - 2 * MARGEN
ANCHO_FOTO = 1.9 * inch

H1 = ParagraphStyle("H1", fontName="Fraunces", fontSize=21, leading=26, textColor=BOSQUE, spaceAfter=8, keepWithNext=1)
H2 = ParagraphStyle("H2", fontName="Poppins-Semi", fontSize=12.5, leading=17, textColor=BOSQUE, spaceBefore=4, spaceAfter=4, keepWithNext=1)
# El texto de entrada de un capítulo también se queda con lo que sigue (título + entrada + primer bloque juntos).
ENTRADA = ParagraphStyle("Entrada", fontName="Poppins", fontSize=10, leading=15, textColor=TEXTO, spaceAfter=12, keepWithNext=1)
CUERPO = ParagraphStyle("Cuerpo", fontName="Poppins", fontSize=10, leading=15, textColor=TEXTO, spaceAfter=6)
PASO = ParagraphStyle("Paso", parent=CUERPO, spaceAfter=3)
NOTA = ParagraphStyle("Nota", fontName="Poppins", fontSize=9.2, leading=13.5, textColor=BOSQUE)
PIE = ParagraphStyle("Pie", fontName="Poppins", fontSize=8.5, leading=11, textColor=TENUE, alignment=TA_CENTER, spaceBefore=4)
CELDA = ParagraphStyle("Celda", fontName="Poppins", fontSize=9.2, leading=13, textColor=TEXTO)
CELDA_T = ParagraphStyle("CeldaT", parent=CELDA, fontName="Poppins-Semi", textColor=colors.white)


def foto(nombre, ancho=ANCHO_FOTO):
    ruta = os.path.join(IMG, nombre)
    w, h = ImageReader(ruta).getSize()
    img = Image(ruta, width=ancho, height=ancho * h / w)
    t = Table([[img]], colWidths=[ancho])
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, LINEA), ("ROUNDEDCORNERS", [8, 8, 8, 8]),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def p(texto, estilo=CUERPO):
    return Paragraph(texto, estilo)


def pasos(items, numerados=True):
    return ListFlowable(
        [ListItem(p(t, PASO), leftIndent=14) for t in items],
        bulletType="1" if numerados else "bullet", start="1" if numerados else "•",
        bulletFontName="Poppins-Semi", bulletFontSize=9.5, bulletColor=BOSQUE if numerados else AMBAR,
        leftIndent=16,
    )


def consejo(texto, titulo="Consejo"):
    t = Table([[p(f"<font name='Poppins-Semi'>{titulo}.</font> {texto}", NOTA)]], colWidths=[None])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), AMBAR_SUAVE), ("ROUNDEDCORNERS", [8, 8, 8, 8]),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def fila(imagen, contenido, pie=None):
    """Captura a la izquierda, explicación a la derecha."""
    izq = [foto(imagen)] + ([p(pie, PIE)] if pie else [])
    t = Table([[izq, contenido]], colWidths=[ANCHO_FOTO + 0.25 * inch, ANCHO - ANCHO_FOTO - 0.25 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), 14),
        ("RIGHTPADDING", (1, 0), (1, 0), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
    ]))
    return KeepTogether([t, Spacer(1, 16)])


def par(a, pie_a, b, pie_b, ancho=ANCHO_FOTO):
    """Dos capturas lado a lado."""
    t = Table([[[foto(a, ancho), p(pie_a, PIE)], [foto(b, ancho), p(pie_b, PIE)]]], colWidths=[ANCHO / 2, ANCHO / 2])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return KeepTogether([t, Spacer(1, 14)])


def tabla(filas, anchos):
    datos = [[p(c, CELDA_T) for c in filas[0]]] + [[p(c, CELDA) for c in f] for f in filas[1:]]
    t = Table(datos, colWidths=anchos, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BOSQUE), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, HUESO]),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, LINEA), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ROUNDEDCORNERS", [8, 8, 8, 8]),
    ]))
    return t


def seccion(numero, titulo, intro=None):
    out = [p(f"<font color='#e1a644'>{numero}</font>  {titulo}", H1)]
    if intro:
        out.append(p(intro, ENTRADA))
    return out


# ── Portada y pie de página ──────────────────────────────────
def portada(c, doc):
    c.saveState()
    c.setFillColor(HUESO_2)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    alto = PAGE_H * 0.62
    c.setFillColor(BOSQUE)
    c.roundRect(-20, PAGE_H - alto, PAGE_W + 40, alto + 20, 36, stroke=0, fill=1)
    # anillos de la huella
    c.setStrokeColor(BOSQUE_2)
    c.setLineWidth(1.2)
    for r in range(40, 260, 26):
        c.circle(PAGE_W - 1.1 * inch, PAGE_H - 1.4 * inch, r, stroke=1, fill=0)
    c.setFillColor(AMBAR)
    c.setFont("Poppins-Bold", 10.5)
    c.drawString(MARGEN, PAGE_H - 1.35 * inch, "AMAZONÍA EMPRENDE · CAMPO")
    c.setFillColor(HUESO)
    c.setFont("Fraunces", 44)
    c.drawString(MARGEN, PAGE_H - 2.35 * inch, "App de Campo")
    c.setFont("Poppins", 17)
    c.drawString(MARGEN, PAGE_H - 2.85 * inch, "Manual de usuario")
    c.setFont("Poppins", 11.5)
    c.setFillColor(colors.HexColor("#cfd6cc"))
    lineas = ["Visita al predio: sitios de siembra y límite en el mapa,",
              "evaluación de campo (AE-CAMPO-001) y encuesta predial.",
              "Incluye el flujo «campo primero», la capa de apoyo y los",
              "predios de práctica para capacitarse."]
    for i, l in enumerate(lineas):
        c.drawString(MARGEN, PAGE_H - 3.55 * inch - i * 17, l)
    c.setFillColor(TEXTO)
    c.setFont("Poppins-Semi", 11)
    c.drawString(MARGEN, 2.1 * inch, "Dirección de la app")
    c.setFont("Poppins", 11)
    c.drawString(MARGEN, 2.1 * inch - 17, "https://app-campo-gz5f.vercel.app")
    c.setFillColor(TENUE)
    c.setFont("Poppins", 9.5)
    c.drawString(MARGEN, 1.2 * inch, "Versión de octubre de 2026. Las capturas usan predios y personas de ejemplo.")
    c.drawString(MARGEN, 1.2 * inch - 14, "Inspirar · Nutrir · Actuar")
    c.restoreState()


def pie_pagina(c, doc):
    c.saveState()
    c.setStrokeColor(LINEA)
    c.setLineWidth(0.6)
    c.line(MARGEN, 0.62 * inch, PAGE_W - MARGEN, 0.62 * inch)
    c.setFont("Poppins", 8.5)
    c.setFillColor(TENUE)
    c.drawString(MARGEN, 0.42 * inch, "App de Campo · Manual de usuario")
    c.drawRightString(PAGE_W - MARGEN, 0.42 * inch, str(doc.page))
    c.restoreState()


# ── Contenido ────────────────────────────────────────────────
H = []
H += [NextPageTemplate("contenido"), PageBreak()]

H += seccion("", "Cómo se trabaja con la app",
             "La app acompaña la visita al predio. En el mapa se verifican o se dibujan los <b>sitios de siembra</b> y el "
             "<b>límite del predio</b>; después se llenan la <b>evaluación de campo</b> (AE-CAMPO-001) y la <b>encuesta predial</b>. "
             "Funciona sin señal: todo queda guardado en el celular y se sube cuando vuelve la señal.")
H.append(p("En cada predio, el orden es este:", H2))
H.append(pasos([
    "<b>Antes de salir, con señal:</b> abre la app y la lista de predios, para que se descarguen al celular.",
    "<b>En el predio:</b> Módulo SIG. Verifica o dibuja los sitios de siembra y revisa el límite del predio.",
    "<b>Evaluación de campo:</b> una sección de cobertura, suelo y logística por cada sitio vigente.",
    "<b>Encuesta predial:</b> la caracterización socioeconómica de la familia.",
    "<b>De regreso, con señal:</b> pulsa <b>Sincronizar</b>.",
]))
H.append(Spacer(1, 8))
H.append(p("Hay dos tipos de predio", H2))
H.append(tabla([
    ["", "Con propuesta del SIG", "Campo primero"],
    ["Cómo llega", "El SIG ya dibujó el límite y unos sitios de siembra.", "Sin sitios del SIG. A veces con el límite, a veces sin nada."],
    ["Qué se hace en terreno", "Confirmar, corregir o descartar cada sitio, y revisar el límite.", "Trazar el límite (si falta) y dibujar los sitios desde cero."],
    ["Cómo se reconoce", "Etiqueta «N sitio(s) propuestos por el SIG».", "Etiqueta amarilla «Campo primero · se delimita en terreno»."],
    ["Después", "El SIG revisa en la oficina lo que hizo campo.", "El SIG confirma en la oficina lo que dibujó campo."],
], [1.35 * inch, (ANCHO - 1.35 * inch) / 2, (ANCHO - 1.35 * inch) / 2]))
H.append(Spacer(1, 12))
H.append(p("Palabras que vas a ver", H2))
H.append(tabla([
    ["Palabra", "Qué es"],
    ["Sitio de siembra", "El pedazo del predio donde se va a sembrar. Es lo que se evalúa en la evaluación de campo."],
    ["Límite del predio", "El lindero de la finca. Línea blanca punteada en el mapa."],
    ["Capa de apoyo", "Guía de referencia en el mapa, por ejemplo las áreas elegibles para Ley del Árbol o mercado de carbono. No son sitios: no se verifican ni se evalúan."],
    ["Sincronizar", "Subir a la base del proyecto lo que está guardado en el celular."],
    ["Predio de práctica", "Predio de mentiras para capacitarse. Nada de lo que se hace ahí se sube."],
], [1.6 * inch, ANCHO - 1.6 * inch]))
H.append(PageBreak())

# 1. Instalar y entrar
H.append(KeepTogether(seccion("1", "Instalar y entrar por primera vez") + [par("01-nombre.jpg", "Escribe tu nombre completo.", "02-confirmar-nombre.jpg", "Confírmalo: queda fijo en este celular.")]))
H.append(pasos([
    "Abre <b>app-campo-gz5f.vercel.app</b> en Chrome, en el celular.",
    "Instálala: menú de los tres puntos de Chrome, <b>Agregar a pantalla de inicio</b>. La app también avisa cómo hacerlo.",
    "Escribe tu nombre completo, como firmarías un formulario, y confírmalo.",
]))
H.append(consejo("El nombre identifica quién llenó cada formulario y evita que la misma persona llene dos veces el mismo predio. "
                 "No se puede cambiar después: revisa que esté bien escrito y usa el mismo en todos los celulares."))
H.append(PageBreak())

# 2. Inicio y lista de predios
H += seccion("2", "El inicio y la lista de predios")
H.append(fila("03-inicio.jpg", [
    p("Arriba está el estado de la señal (<b>Con señal</b> / <b>Sin señal</b>) y cuatro pestañas:"),
    pasos([
        "<b>Mis registros:</b> los predios que abriste en este celular, con el avance de sus formularios.",
        "<b>Predios:</b> todos los predios que jurídica tiene registrados.",
        "<b>Todos:</b> lo que ya subió el equipo completo.",
        "<b>Estadísticas:</b> conteos generales.",
    ], numerados=False),
    Spacer(1, 6),
    p("En <b>Mis registros</b> siempre aparecen dos predios marcados <b>PRÁCTICA</b> (ver el capítulo 8)."),
]))
H.append(fila("04-predios.jpg", [
    p("Cada tarjeta muestra el predio, el propietario, el municipio, la vereda y la etapa en que va. Las etiquetas dicen qué hay que hacer:"),
    pasos([
        "<b>«N sitio(s) propuestos por el SIG»:</b> hay sitios para verificar.",
        "<b>«Campo primero · se delimita en terreno»:</b> no hay propuesta; los sitios se dibujan en la visita.",
        "<b>«Con capa de apoyo»:</b> el mapa trae una guía, por ejemplo las áreas elegibles.",
    ], numerados=False),
    Spacer(1, 6),
    p("Busca por predio, propietario, municipio o vereda. Al tocar un predio se abre y queda guardado en el celular."),
    consejo("Abre los predios que vas a visitar mientras tienes señal. Así quedan guardados, con su mapa, para trabajarlos sin señal."),
]))

# 3. Ficha del predio
H += seccion("3", "La ficha del predio")
H.append(fila("05-predio.jpg", [
    p("La ficha resume el predio y tiene los tres pasos de la visita, en orden:"),
    pasos([
        "<b>Módulo SIG:</b> el mapa con los sitios y el límite.",
        "<b>Evaluación de Campo:</b> se habilita cuando hay al menos un sitio.",
        "<b>Encuesta Predial:</b> la caracterización de la familia.",
    ]),
    Spacer(1, 6),
    p("<b>Actualizar desde el SIG</b> trae los cambios que el SIG haya hecho en la oficina después de que abriste el predio. "
      "Primero muestra qué cambió y nada se modifica hasta que confirmes. Las correcciones que ya hiciste en campo no se pierden."),
    p("El lápiz de arriba abre la ficha del predio (solo lectura)."),
]))

# 4. Módulo SIG con propuesta
H.append(KeepTogether(seccion("4", "Módulo SIG: predio con propuesta del SIG") + [fila("06-sig-sitios.jpg", [
    p("En el mapa satelital:"),
    pasos([
        "<b>Línea blanca punteada:</b> el límite del predio.",
        "<b>Polígonos naranja:</b> sitios por verificar.",
        "<b>Barra de arriba:</b> dónde estás. «Estás DENTRO de la Zona 1» o «A 26 m al NE de la Zona 1».",
        "<b>Botones:</b> centrar en tu ubicación, <b>+</b> para dibujar un sitio nuevo y la huella para trazarlo caminando.",
    ], numerados=False),
    Spacer(1, 6),
    p("Abajo hay dos pestañas: <b>Sitios de siembra</b> y <b>Límite del predio</b>."),
])]))
H.append(fila("07-sig-zona.jpg", [
    p("Toca una zona en el mapa o en la lista y elige:"),
    pasos([
        "<b>Confirmar:</b> el sitio está bien como lo dibujó el SIG.",
        "<b>Corregir límite:</b> el sitio existe, pero su borde no es ese.",
        "<b>Descartar:</b> no sirve para sembrar. Queda marcado, no se borra.",
    ], numerados=False),
    Spacer(1, 6),
    p("Puedes dejar observaciones. Los colores cambian según lo que hiciste: verde confirmada, azul corregida, "
      "turquesa dibujada en campo, rojo descartada y naranja por verificar."),
]))
H.append(fila("08-sig-corregir.jpg", [
    p("Para corregir el borde:"),
    pasos([
        "Arrastra un vértice (los círculos blancos) para moverlo.",
        "Tócalo para quitarlo, o toca una línea para agregar uno.",
        "La sombra gris muestra cómo estaba antes.",
        "Pulsa <b>Guardar</b>.",
    ]),
    consejo("Una corrección guardada no se pierde aunque después pulses Confirmar: la zona queda como corregida."),
]))
H.append(fila("09-sig-limite.jpg", [
    p("En la pestaña <b>Límite del predio</b> se revisa el lindero de la finca:"),
    pasos([
        "Toca el límite y elige <b>Confirmar</b> o <b>Corregir lindero</b>.",
        "Si el predio tiene otro pedazo, dibújalo con <b>+</b>.",
    ]),
    Spacer(1, 4),
    p("Mientras trabajas el límite, los sitios se ven tenues para que no estorben."),
]))

# 5. Campo primero
H.append(KeepTogether(seccion("5", "Módulo SIG: predio «campo primero»",
             "Estos predios llegan sin sitios del SIG: en la visita se traza el límite, si falta, y se dibujan los sitios de siembra. "
             "Después el SIG los confirma en la oficina.") + [
    par("10-predio-campo-primero.jpg", "La ficha lo avisa con un recuadro amarillo.",
        "11-campo-primero-mapa.jpg", "El mapa, con la capa de apoyo y su leyenda."),
    p("La evaluación de campo queda bloqueada hasta que dibujes el primer sitio: se evalúa lo que se dibujó. "
      "Si el predio no tiene límite, el mapa abre en la pestaña <b>Límite del predio</b>: se empieza por el lindero."),
    p("<b>Capa de apoyo.</b> Si el predio la tiene, se ve punteada y tenue debajo de todo, con su leyenda: en amarillo las áreas "
      "de Ley del Árbol y en lila las de mercado de carbono. Es una guía: no son sitios y no se tocan. "
      "El botón de capas (azul) la oculta o la muestra."),
    consejo("Dibuja los sitios donde de verdad se va a sembrar, usando la capa como referencia. Un sitio puede quedar dentro, "
            "fuera o encima de varias áreas."),
]))
H.append(Spacer(1, 14))
H.append(KeepTogether([par("12-dibujando.jpg", "Dibujar en el mapa: toca cada vértice.", "13-sitio-dibujado.jpg", "El sitio queda «Dibujada en campo».", ancho=1.6 * inch),
                        pasos([
    "Pulsa <b>+</b> (o <b>En el mapa</b> si todavía no hay sitios).",
    "Toca el mapa en cada esquina del sitio.",
    "Cierra tocando el primer punto. El sitio queda guardado como <b>Dibujada en campo</b>.",
])]))
H.append(Spacer(1, 10))
H.append(fila("14-trazar-caminando.jpg", [
    p("<b>Trazar caminando</b> sirve para el límite o para un sitio cuando el satelital no deja ver bien:"),
    pasos([
        "Pulsa la huella.",
        "Camina el borde y pulsa <b>Marcar punto</b> en cada quiebre.",
        "Con la flecha quitas el último punto si te equivocaste.",
        "Con 3 puntos o más, pulsa <b>Cerrar y guardar</b>.",
    ]),
    consejo("Mira la precisión (±m). Si es mala, quédate quieto unos segundos antes de marcar. Recorre el lindero con el propietario."),
]))

# 6. Formularios
H.append(KeepTogether(seccion("6", "Evaluación de campo y encuesta predial") + [par("15-evaluacion.jpg", "Evaluación de campo (7 pasos).", "16-encuesta.jpg", "Encuesta predial (8 secciones).")]))
H.append(pasos([
    "La <b>evaluación de campo</b> repite cobertura, suelo y logística una vez por cada sitio vigente. Si descartas o agregas sitios, "
    "las secciones se ajustan solas.",
    "La <b>encuesta predial</b> tiene 8 secciones: general, vivienda, familia, economía, cultivos, ganadería, tecnología y bosque.",
    "Avanza con <b>Siguiente</b>. Cada paso queda guardado en el celular: puedes salir y volver.",
], numerados=False))
H.append(consejo("Si descartas un sitio después de llenar su sección, esos datos no se pierden: quedan marcados como descartados."))
H.append(PageBreak())

# 7. Sincronizar
H.append(KeepTogether(seccion("7", "Sincronizar y trabajar sin señal") + [par("17-mis-registros.jpg", "«N registro(s) por subir» y el botón Sincronizar.", "21-sin-senal.jpg", "Sin señal se sigue trabajando igual.")]))
H.append(pasos([
    "Todo lo que haces queda guardado en el celular, con o sin señal.",
    "Con señal, en <b>Mis registros</b> aparece cuántos registros faltan por subir. Pulsa <b>Sincronizar</b>.",
    "Cuando vuelve la señal, la app también intenta subir sola.",
    "Si algo queda con error, sigue guardado: vuelve a sincronizar con mejor señal.",
], numerados=False))
H.append(consejo("No borres la app ni los datos de Chrome mientras haya registros por subir: se perderían.", "Importante"))
H.append(PageBreak())

# 8. Práctica
H += seccion("8", "Practicar antes de ir a campo",
             "En <b>Mis registros</b> siempre hay dos predios marcados <b>PRÁCTICA</b>. Son de mentiras: nada de lo que se haga ahí se sube. "
             "Se arman alrededor de donde estés, según el GPS, para poder caminarlos en la capacitación.")
H.append(fila("18-practica.jpg", [
    pasos([
        "<b>Práctica 1 · Verificar al SIG:</b> límite y 3 sitios propuestos para confirmar, corregir o descartar.",
        "<b>Práctica 2 · Campo primero:</b> sin límite ni sitios, con una capa de apoyo de ejemplo.",
    ], numerados=False),
    Spacer(1, 6),
    p("<b>Empezar de nuevo</b> borra lo hecho en ese predio de práctica (sitios, límite, evaluación y encuesta) y lo deja como nuevo, "
      "para la siguiente persona."),
    consejo("Si borras un predio de práctica desde Mis registros, la app lo vuelve a crear la próxima vez que abras el inicio."),
]))
H.append(par("19-practica-sig.jpg", "Práctica 1: sitios propuestos alrededor tuyo.", "20-practica-campo-primero.jpg", "Práctica 2: capa de apoyo, sin límite."))
H.append(p("Ejercicios sugeridos", H2))
H.append(tabla([
    ["Práctica 1 · Verificar al SIG", "Práctica 2 · Campo primero"],
    ["1. Ubícate con el GPS: mira la barra de arriba.<br/>2. Confirma la Zona 1.<br/>3. Corrige la Zona 2 moviendo un vértice.<br/>"
     "4. Descarta la Zona 3.<br/>5. Dibuja un sitio nuevo con +.<br/>6. Confirma el límite.<br/>7. Llena la evaluación de campo.",
     "1. Traza el límite caminando, con al menos 3 puntos.<br/>2. Dibuja dos sitios sobre la capa de apoyo.<br/>"
     "3. Oculta y muestra la capa.<br/>4. Llena la evaluación y la encuesta.<br/>5. Pulsa Sincronizar: la práctica se marca como subida, sin subir nada.<br/>"
     "6. Pulsa Empezar de nuevo."],
], [ANCHO / 2, ANCHO / 2]))
H.append(PageBreak())

# 9. Problemas frecuentes
H += seccion("9", "Problemas frecuentes")
H.append(tabla([
    ["Lo que pasa", "Qué hacer"],
    ["«Permiso de ubicación denegado»", "Activa la ubicación del celular y dale permiso a Chrome (o a la app instalada) en los ajustes."],
    ["Se queda en «Buscando señal GPS…»", "Sal a cielo abierto y espera. La precisión mejora si te quedas quieto."],
    ["No aparece un predio en la lista", "Abre la pestaña Predios con señal para que se actualice. Si sigue sin salir, jurídica todavía no lo ha registrado o el expediente está rechazado."],
    ["«El servidor todavía no recibe límites dibujados en campo…»", "El límite quedó guardado en el celular y se sube solo cuando el equipo de sistemas active esa función. No hay que repetirlo."],
    ["Un sitio dice «Retirada por el SIG»", "El SIG lo quitó en la oficina. Si ya tenía trabajo de campo, ese trabajo se conserva."],
    ["Registros con error al sincronizar", "Siguen guardados. Vuelve a sincronizar con buena señal; si el error se repite, avisa con una captura de pantalla."],
    ["Cambié de celular", "La app pide el nombre otra vez. Lo que no se subió desde el celular anterior sigue solo en ese celular: sincronízalo antes de cambiar."],
], [2.2 * inch, ANCHO - 2.2 * inch]))
H.append(Spacer(1, 14))
H.append(p("Este manual se rehace con los archivos de <b>app_campo/manual</b> (servidor de ejemplo, capturas y este generador) "
           "cada vez que cambie la app.", PIE))

doc = BaseDocTemplate(OUT, pagesize=letter, leftMargin=MARGEN, rightMargin=MARGEN, topMargin=0.7 * inch, bottomMargin=0.85 * inch,
                      title="App de Campo · Manual de usuario", author="Amazonía Emprende", subject="Manual de usuario de la app de campo")
marco = Frame(MARGEN, 0.85 * inch, ANCHO, PAGE_H - 0.7 * inch - 0.85 * inch, id="marco", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
doc.addPageTemplates([
    PageTemplate(id="portada", frames=[marco], onPage=portada),
    PageTemplate(id="contenido", frames=[marco], onPage=pie_pagina),
])
doc.build(H)
print("escrito", OUT)
