import SwiftUI

// MARK: - Category model

/// Canonical Nomi memory categories with a stable mapping from free-form
/// category strings (backend categories are user/AI-generated text) to a
/// glyph. Visual direction follows assets/CategoryIcons/source/IconSheets*.png:
/// the Nomi ghost silhouette outlined in purple with a simple glyph inside.
enum NomiCategory: String, CaseIterable, Identifiable {
    case tech
    case fitness
    case trading
    case music
    case ideas
    case coding
    case projects
    case travel
    case general

    var id: String { rawValue }

    /// Fuzzy-matches a raw category string ("Tech", "technology", "AI & Tech",
    /// "Day Trading", …) to a canonical category. Falls back to `.general`.
    static func match(_ raw: String) -> NomiCategory {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !value.isEmpty else { return .general }

        let keywordMap: [(NomiCategory, [String])] = [
            (.coding, ["coding", "code", "programming", "developer", "software", "engineering"]),
            (.tech, ["tech", "ai", "artificial intelligence", "startup", "gadget"]),
            (.fitness, ["fitness", "workout", "gym", "health", "exercise", "training"]),
            (.trading, ["trading", "trade", "invest", "stock", "crypto", "market", "finance"]),
            (.music, ["music", "song", "audio", "playlist", "producer"]),
            (.ideas, ["idea", "inspiration", "insight", "thought", "brainstorm"]),
            (.projects, ["project", "task", "todo", "plan", "checklist"]),
            (.travel, ["travel", "trip", "flight", "vacation", "destination"]),
        ]
        for (category, keywords) in keywordMap where keywords.contains(where: { value.contains($0) }) {
            return category
        }
        return .general
    }

    /// SF Symbol for the category glyph. Trading has no SF candlestick symbol
    /// and uses the custom `CandlestickGlyphShape` instead (nil here).
    var symbolName: String? {
        switch self {
        case .tech: "chevron.left.forwardslash.chevron.right"
        case .fitness: "dumbbell"
        case .trading: nil
        case .music: "music.note"
        case .ideas: "lightbulb"
        case .coding: "laptopcomputer"
        case .projects: "checklist"
        case .travel: "airplane"
        case .general: "sparkles"
        }
    }
}

// MARK: - Theme color

extension Color {
    /// Stroke color for category icons: Nomi purple in light mode, a brighter
    /// lavender in dark mode (matching IconSheetsDarkmode.png).
    static func nomiCategoryStroke(for colorScheme: ColorScheme) -> Color {
        colorScheme == .dark
            ? Color(red: 0.64, green: 0.52, blue: 1.00)
            : Color.nomiPurple
    }
}

// MARK: - Ghost silhouette

/// The Nomi ghost silhouette from the icon sheets: a tall dome head with two
/// side "arm" bumps and a gently rounded base. Drawn in a unit-relative
/// coordinate space so it scales with its frame; stroke it, don't fill.
struct NomiGhostShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width
        let h = rect.height
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + x * w, y: rect.minY + y * h)
        }

        var path = Path()
        // Left side of the head, starting where the head meets the left arm.
        path.move(to: pt(0.20, 0.55))
        // Dome up to the apex and down the right side.
        path.addCurve(to: pt(0.50, 0.04), control1: pt(0.20, 0.26), control2: pt(0.30, 0.04))
        path.addCurve(to: pt(0.80, 0.55), control1: pt(0.70, 0.04), control2: pt(0.80, 0.26))
        // Right arm: bulge outward, curl back under.
        path.addCurve(to: pt(0.97, 0.66), control1: pt(0.88, 0.55), control2: pt(0.95, 0.58))
        path.addCurve(to: pt(0.80, 0.82), control1: pt(0.99, 0.76), control2: pt(0.91, 0.83))
        // Base: soft rounded bottom back to the left arm's underside.
        path.addCurve(to: pt(0.50, 0.92), control1: pt(0.72, 0.88), control2: pt(0.62, 0.92))
        path.addCurve(to: pt(0.20, 0.82), control1: pt(0.38, 0.92), control2: pt(0.28, 0.88))
        // Left arm mirroring the right.
        path.addCurve(to: pt(0.03, 0.66), control1: pt(0.09, 0.83), control2: pt(0.01, 0.76))
        path.addCurve(to: pt(0.20, 0.55), control1: pt(0.05, 0.58), control2: pt(0.12, 0.55))
        path.closeSubpath()
        return path
    }
}

// MARK: - Candlestick glyph (no SF Symbol exists)

/// Three candlesticks with wicks, matching the Trading tile on the sheets.
struct CandlestickGlyphShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let w = rect.width
        let h = rect.height

        // (centerX, wickTop, bodyTop, bodyBottom, wickBottom) in unit space.
        let candles: [(CGFloat, CGFloat, CGFloat, CGFloat, CGFloat)] = [
            (0.20, 0.30, 0.45, 0.80, 0.95),
            (0.50, 0.10, 0.28, 0.62, 0.78),
            (0.80, 0.00, 0.16, 0.50, 0.64),
        ]
        let bodyWidth = 0.16 * w

        for (cx, wickTop, bodyTop, bodyBottom, wickBottom) in candles {
            let x = rect.minX + cx * w
            // Wick (single vertical line through the candle).
            path.move(to: CGPoint(x: x, y: rect.minY + wickTop * h))
            path.addLine(to: CGPoint(x: x, y: rect.minY + bodyTop * h))
            path.move(to: CGPoint(x: x, y: rect.minY + bodyBottom * h))
            path.addLine(to: CGPoint(x: x, y: rect.minY + wickBottom * h))
            // Body outline.
            path.addRoundedRect(
                in: CGRect(
                    x: x - bodyWidth / 2,
                    y: rect.minY + bodyTop * h,
                    width: bodyWidth,
                    height: (bodyBottom - bodyTop) * h
                ),
                cornerSize: CGSize(width: bodyWidth * 0.22, height: bodyWidth * 0.22)
            )
        }
        return path
    }
}

// MARK: - Glyph view (usable standalone at small sizes, e.g. galaxy nodes)

/// Just the category glyph — SF Symbol or the custom candlestick — in a single
/// color. Use inside chips, canvas nodes, or the full ghost icon below.
struct NomiCategoryGlyph: View {
    let category: NomiCategory
    var color: Color
    var weight: Font.Weight = .semibold

    init(category: NomiCategory, color: Color, weight: Font.Weight = .semibold) {
        self.category = category
        self.color = color
        self.weight = weight
    }

    init(categoryName: String, color: Color, weight: Font.Weight = .semibold) {
        self.init(category: NomiCategory.match(categoryName), color: color, weight: weight)
    }

    var body: some View {
        GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height)
            Group {
                if let symbol = category.symbolName {
                    Image(systemName: symbol)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .fontWeight(weight)
                        .foregroundStyle(color)
                } else {
                    CandlestickGlyphShape()
                        .stroke(color, style: StrokeStyle(lineWidth: max(1.2, side * 0.07), lineCap: .round))
                }
            }
            .frame(width: side, height: side)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

// MARK: - Full category icon (ghost + glyph)

/// The reusable category icon from the sheets: Nomi ghost outline with the
/// category glyph centered in the body. Theme-aware; transparent background.
struct NomiCategoryIconView: View {
    @Environment(\.colorScheme) private var colorScheme

    let category: NomiCategory
    var size: CGFloat = 44
    /// Override the stroke color (e.g. white inside colored canvas nodes).
    var strokeColor: Color? = nil

    init(category: NomiCategory, size: CGFloat = 44, strokeColor: Color? = nil) {
        self.category = category
        self.size = size
        self.strokeColor = strokeColor
    }

    init(categoryName: String, size: CGFloat = 44, strokeColor: Color? = nil) {
        self.init(category: NomiCategory.match(categoryName), size: size, strokeColor: strokeColor)
    }

    private var resolvedColor: Color {
        strokeColor ?? Color.nomiCategoryStroke(for: colorScheme)
    }

    var body: some View {
        ZStack {
            NomiGhostShape()
                .stroke(resolvedColor, style: StrokeStyle(lineWidth: max(1.5, size * 0.055), lineCap: .round, lineJoin: .round))

            NomiCategoryGlyph(category: category, color: resolvedColor)
                .frame(width: size * 0.34, height: size * 0.34)
                // Glyph sits in the body's center, like the sheets.
                .offset(y: size * 0.13)
        }
        .frame(width: size, height: size)
        .accessibilityLabel(Text("\(category.rawValue.capitalized) category"))
    }
}

#Preview("Category icons") {
    VStack(spacing: 20) {
        ForEach([ColorScheme.light, ColorScheme.dark], id: \.self) { scheme in
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 18) {
                ForEach(NomiCategory.allCases) { category in
                    VStack(spacing: 6) {
                        NomiCategoryIconView(category: category, size: 56)
                        Text(category.rawValue.capitalized)
                            .font(.caption2.weight(.semibold))
                    }
                }
            }
            .padding()
            .background(scheme == .dark ? Color.black : Color.white)
            .environment(\.colorScheme, scheme)
        }
    }
    .padding()
}
