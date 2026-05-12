import Combine
import CoreLocation
import Foundation

final class LocationProvider: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var currentLocation: CLLocationCoordinate2D?
    /// Для поворота карты в режиме навигации; < 0 если курс пока недоступен.
    @Published var course: CLLocationDirection = -1
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        // Для маршрутизатора не нужен best: реже обновления → меньше перерисовок SwiftUI.
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 12
    }

    func start() {
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }

    /// В режиме навигации — чаще и точнее; в обычном — экономим батарею и главный поток.
    func setHighAccuracyNavigationMode(_ on: Bool) {
        if on {
            manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
            manager.distanceFilter = 5
        } else {
            manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
            manager.distanceFilter = 12
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        currentLocation = location.coordinate
        if location.course >= 0 {
            course = location.course
        }
    }
}
