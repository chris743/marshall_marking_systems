import 'package:flutter_test/flutter_test.dart';
import 'package:mms_mobile/main.dart';

void main() {
  testWidgets('App starts and shows home screen', (WidgetTester tester) async {
    await tester.pumpWidget(const MMSMobileApp());
    await tester.pumpAndSettle();

    // Verify home screen is displayed
    expect(find.text('MMS Mobile'), findsOneWidget);
    expect(find.text('Manual Print'), findsOneWidget);
    expect(find.text('Scanner Mode'), findsOneWidget);
  });
}
