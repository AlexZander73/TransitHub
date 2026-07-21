import Capacitor
import UIKit

@objc(CoastPulseAppearanceNativePlugin)
public class CoastPulseAppearanceNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CoastPulseAppearanceNativePlugin"
    public let jsName = "CoastPulseAppearanceNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setAlternateIcon", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAlternateIcon", returnType: CAPPluginReturnPromise)
    ]

    private let allowedIconNames: Set<String> = [
        "AppIconAurora",
        "AppIconTransitMotion",
        "AppIconCoastlineExplorer"
    ]

    @objc func setAlternateIcon(_ call: CAPPluginCall) {
        let requestedName = call.getString("name")
        if let requestedName, !allowedIconNames.contains(requestedName) {
            call.reject("Unknown CoastPulse app icon.", "INVALID_ICON")
            return
        }

        DispatchQueue.main.async {
            let application = UIApplication.shared
            guard application.supportsAlternateIcons else {
                call.unavailable("Alternate app icons are not supported on this device.")
                return
            }

            if application.alternateIconName == requestedName {
                let resolvedName: Any = requestedName ?? NSNull()
                call.resolve(["name": resolvedName, "changed": false])
                return
            }

            application.setAlternateIconName(requestedName) { error in
                if let error {
                    call.reject("Unable to change the CoastPulse app icon.", "ICON_CHANGE_FAILED", error)
                    return
                }
                let resolvedName: Any = requestedName ?? NSNull()
                call.resolve(["name": resolvedName, "changed": true])
            }
        }
    }

    @objc func getAlternateIcon(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let application = UIApplication.shared
        let resolvedName: Any = application.alternateIconName ?? NSNull()
        call.resolve([
            "name": resolvedName,
            "supported": application.supportsAlternateIcons
        ])
        }
    }
}
