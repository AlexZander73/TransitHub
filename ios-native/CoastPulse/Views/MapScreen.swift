import MapKit
import SwiftUI

struct MapScreen: View {
    @EnvironmentObject private var repository: TransitRepository
    @EnvironmentObject private var settings: UserSettings
    @EnvironmentObject private var locationService: LocationService
    @EnvironmentObject private var navigation: AppNavigation

    @State private var camera: MapCameraPosition = .region(Self.region(for: "gold-coast"))
    @State private var mapSelection: String?
    @State private var query = ""
    @State private var showTrams = true
    @State private var showBuses = true
    @State private var showVehicles = true
    @State private var followLocationRequest = false

    var body: some View {
        GeometryReader { proxy in
            map
                .ignoresSafeArea(edges: .top)
                .overlay(alignment: .top) {
                    topOverlay.padding(.top, proxy.safeAreaInsets.top)
                }
                .overlay(alignment: .trailing) { controlRail.padding(.trailing, 12) }
                .overlay(alignment: .bottom) {
                    if let error = locationService.errorMessage {
                        Text(error)
                            .font(.caption)
                            .padding(10)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
                            .padding(.bottom, 10)
                            .padding(.horizontal)
                    }
                }
        }
        .onChange(of: mapSelection) { _, value in
            guard let value, repository.stopByID[value] != nil else { return }
            navigation.selectedStopID = value
            mapSelection = nil
        }
        .onChange(of: settings.selectedRegionID) { _, regionID in
            camera = .region(Self.region(for: regionID))
        }
        .onChange(of: locationService.location) { _, location in
            guard followLocationRequest, let location else { return }
            followLocationRequest = false
            focusLocation(location.coordinate)
        }
    }

    private var map: some View {
        Map(position: $camera, interactionModes: .all, selection: $mapSelection) {
            if locationService.isAuthorized { UserAnnotation() }

            ForEach(repository.shapeSections(in: settings.selectedRegionID, showTrams: showTrams, showBuses: showBuses)) { section in
                MapPolyline(coordinates: section.coordinates)
                    .stroke(
                        Color(hex: section.route.color).opacity(section.route.mode == "tram" ? 0.95 : 0.72),
                        style: StrokeStyle(lineWidth: section.route.mode == "tram" ? 7 : 5, lineCap: .round, lineJoin: .round)
                    )
            }

            ForEach(visibleStops) { stop in
                Annotation(stop.name, coordinate: stop.coordinate, anchor: .center) {
                    StopMapMarker(stop: stop, theme: settings.theme)
                }
                .tag(stop.id)
            }

            if showVehicles {
                ForEach(repository.vehicles(in: settings.selectedRegionID, showTrams: showTrams, showBuses: showBuses)) { vehicle in
                    Annotation(vehicle.label, coordinate: vehicle.coordinate, anchor: .center) {
                        VehicleMapMarker(
                            vehicle: vehicle,
                            route: repository.routeByID[vehicle.routeId],
                            health: repository.vehicleHealth.first { $0.vehicleID == vehicle.id }
                        )
                    }
                }
            }
        }
        .mapStyle(mapStyle)
        .mapControls {
            MapCompass()
            MapScaleView()
        }
    }

    private var visibleStops: [TransitStop] {
        repository.stops(in: settings.selectedRegionID).filter { stop in
            let modeVisible = (showTrams && stop.modes.contains("tram"))
                || (showBuses && stop.modes.contains("bus"))
                || stop.modes.contains("train")
            let queryVisible = query.isEmpty
                || stop.name.localizedCaseInsensitiveContains(query)
                || stop.suburb.localizedCaseInsensitiveContains(query)
                || stop.code.localizedCaseInsensitiveContains(query)
            return modeVisible && queryVisible
        }
    }

    private var mapStyle: MapStyle {
        switch settings.theme {
        case .coastlineExplorer:
            .hybrid(elevation: .realistic, pointsOfInterest: .excludingAll, showsTraffic: false)
        case .transitMotion:
            .standard(elevation: .flat, emphasis: .muted, pointsOfInterest: .excludingAll, showsTraffic: false)
        default:
            .standard(elevation: .realistic, emphasis: .automatic, pointsOfInterest: .excludingAll, showsTraffic: false)
        }
    }

    private var searchMatches: [TransitStop] {
        guard !query.isEmpty else { return [] }
        return visibleStops.prefix(4).map { $0 }
    }

    private var topOverlay: some View {
        VStack(spacing: 8) {
            HStack(spacing: 9) {
                Image(systemName: "wave.3.right.circle.fill")
                    .font(.title2)
                    .foregroundStyle(settings.theme.accent)
                TextField("Search stops", text: $query)
                    .textInputAutocapitalization(.words)
                    .submitLabel(.search)
                if !query.isEmpty {
                    Button { query = "" } label: { Image(systemName: "xmark.circle.fill") }
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                }
                Menu {
                    ForEach(repository.regions.filter { $0.status != "planned" }) { region in
                        Button(region.label) { settings.selectedRegionID = region.id }
                    }
                } label: {
                    Image(systemName: "location.circle.fill")
                        .font(.title2)
                        .accessibilityLabel("Choose region")
                }
            }
            .padding(.horizontal, 12)
            .frame(height: 48)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))

            HStack {
                DataHealthBadge(health: repository.dataHealth, updatedAt: repository.lastUpdated)
                Spacer()
                if showVehicles && repository.dataHealth.vehicles != .live {
                    Label("Vehicle positions unavailable", systemImage: "location.slash.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 9).padding(.vertical, 6)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 7))
                }
            }

            if !searchMatches.isEmpty {
                VStack(spacing: 0) {
                    ForEach(searchMatches) { stop in
                        Button {
                            camera = .region(.init(center: stop.coordinate, latitudinalMeters: 3_500, longitudinalMeters: 3_500))
                            navigation.selectedStopID = stop.id
                            query = ""
                        } label: {
                            HStack {
                                Image(systemName: TransitMode(rawValue: stop.modes.first ?? "")?.symbol ?? "mappin")
                                VStack(alignment: .leading) {
                                    Text(stop.name).font(.subheadline.weight(.semibold))
                                    Text(stop.suburb).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                        }
                        .buttonStyle(.plain)
                        if stop.id != searchMatches.last?.id { Divider().padding(.leading, 40) }
                    }
                }
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 6)
    }

    private var controlRail: some View {
        VStack(spacing: 2) {
            FloatingIconButton(symbol: "tram.fill", label: "Toggle tram routes", active: showTrams) { showTrams.toggle() }
            FloatingIconButton(symbol: "bus.fill", label: "Toggle bus routes", active: showBuses) { showBuses.toggle() }
            FloatingIconButton(symbol: "location.fill", label: "Find nearby transport") {
                if let coordinate = locationService.location?.coordinate {
                    focusLocation(coordinate)
                } else {
                    followLocationRequest = true
                    locationService.requestLocation()
                }
            }
            FloatingIconButton(symbol: "dot.radiowaves.left.and.right", label: "Toggle live vehicles", active: showVehicles) {
                showVehicles.toggle()
            }
            FloatingIconButton(symbol: "scope", label: "Reset map") {
                camera = .region(Self.region(for: settings.selectedRegionID))
            }
        }
        .padding(4)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
    }

    private func focusLocation(_ coordinate: CLLocationCoordinate2D) {
        camera = .region(.init(center: coordinate, latitudinalMeters: 4_000, longitudinalMeters: 4_000))
        if let nearest = repository.nearestStop(to: coordinate, in: settings.selectedRegionID) {
            navigation.selectedStopID = nearest.id
        }
    }

    static func region(for id: String) -> MKCoordinateRegion {
        switch id {
        case "brisbane": .init(center: .init(latitude: -27.4705, longitude: 153.0260), span: .init(latitudeDelta: 0.25, longitudeDelta: 0.25))
        case "logan": .init(center: .init(latitude: -27.6545, longitude: 153.1333), span: .init(latitudeDelta: 0.24, longitudeDelta: 0.24))
        default: .init(center: .init(latitude: -27.995, longitude: 153.405), span: .init(latitudeDelta: 0.18, longitudeDelta: 0.18))
        }
    }
}

private struct StopMapMarker: View {
    let stop: TransitStop
    let theme: TransitTheme

    var body: some View {
        ZStack {
            Circle().fill(.white).frame(width: stop.isMajor ? 23 : 17, height: stop.isMajor ? 23 : 17)
            Circle().stroke(theme.accent, lineWidth: stop.isMajor ? 5 : 4).frame(width: stop.isMajor ? 20 : 14, height: stop.isMajor ? 20 : 14)
            if stop.isMajor { Circle().fill(theme.secondaryAccent).frame(width: 5, height: 5) }
        }
        .shadow(color: .black.opacity(0.18), radius: 2, y: 1)
        .accessibilityLabel(stop.name)
    }
}

private struct VehicleMapMarker: View {
    let vehicle: TransitVehicle
    let route: TransitRoute?
    let health: VehicleServiceHealth?

    var body: some View {
        ZStack {
            Circle().fill(Color(hex: route?.color ?? "087F8C")).frame(width: 30, height: 30)
            Image(systemName: health?.condition == .stalled ? "pause.fill" : vehicle.mode == "tram" ? "tram.fill" : "bus.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Color(hex: route?.textColor ?? "FFFFFF"))
        }
        .overlay(Circle().stroke(health?.condition == .stalled ? ServiceCondition.stalled.color : .white, lineWidth: health == nil ? 2 : 4))
        .shadow(color: .black.opacity(0.22), radius: 3, y: 2)
        .accessibilityLabel("Route \(route?.shortName ?? vehicle.routeId) vehicle toward \(vehicle.headsign ?? "next stop")\(health?.condition == .stalled ? ", may be stalled" : "")")
    }
}
