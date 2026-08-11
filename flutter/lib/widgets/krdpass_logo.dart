import 'package:flutter/material.dart';

const _krdpassPrimaryColor = Color(0xff00AAFF);

class KRDPASSLogo extends StatelessWidget {
  final Color? color;
  final double? size;

  const KRDPASSLogo({super.key, this.color, this.size});

  @override
  Widget build(BuildContext context) {
    final iconTheme = IconTheme.of(context);
    final activeSize = size ?? iconTheme.size ?? 24;

    return SizedBox(
      width: activeSize,
      height: activeSize,
      child: FittedBox(
        child: CustomPaint(
          size: const Size(20, 20),
          painter: KRDPASSLogoPainter(
            color: color ?? iconTheme.color ?? _krdpassPrimaryColor,
          ),
        ),
      ),
    );
  }
}

class KRDPASSLogoPainter extends CustomPainter {
  final Color color;

  const KRDPASSLogoPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    Path path_0 = Path();
    path_0.moveTo(7.63, 2.01);
    path_0.arcToPoint(
      Offset(14.73, 3.1499999999999995),
      radius: Radius.elliptical(8.33, 8.33),
      rotation: 0,
      largeArc: false,
      clockwise: true,
    );
    path_0.arcToPoint(
      Offset(15.690000000000001, 1.7699999999999996),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: false,
      clockwise: false,
    );
    path_0.arcToPoint(
      Offset(7.15, 0.41),
      radius: Radius.elliptical(10, 10),
      rotation: 0,
      largeArc: false,
      clockwise: false,
    );
    path_0.arcToPoint(
      Offset(7.630000000000001, 2.0100000000000002),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: true,
      clockwise: false,
    );
    path_0.close();
    path_0.moveTo(4.93, 3.39);
    path_0.arcToPoint(
      Offset(3.9, 2.07),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: true,
      clockwise: false,
    );
    path_0.arcToPoint(
      Offset(2.07, 3.9),
      radius: Radius.elliptical(10, 10),
      rotation: 0,
      largeArc: false,
      clockwise: false,
    );
    path_0.arcToPoint(
      Offset(3.3899999999999997, 4.92),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: false,
      clockwise: false,
    );
    path_0.cubicTo(3.8299999999999996, 4.34, 4.35, 3.82, 4.93, 3.38);
    path_0.close();
    path_0.moveTo(9.87, 5);
    path_0.arcToPoint(
      Offset(13.35, 6.29),
      radius: Radius.elliptical(5, 5),
      rotation: 0,
      largeArc: false,
      clockwise: true,
    );
    path_0.arcToPoint(
      Offset(14.469999999999999, 5.05),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: false,
      clockwise: false,
    );
    path_0.arcToPoint(
      Offset(5.049999999999999, 14.469999999999999),
      radius: Radius.elliptical(6.67, 6.67),
      rotation: 0,
      largeArc: false,
      clockwise: false,
    );
    path_0.arcToPoint(
      Offset(6.289999999999999, 13.349999999999998),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: true,
      clockwise: false,
    );
    path_0.arcToPoint(
      Offset(9.87, 5),
      radius: Radius.elliptical(5, 5),
      rotation: 0,
      largeArc: false,
      clockwise: true,
    );
    path_0.close();
    path_0.moveTo(18.24, 4.34);
    path_0.arcToPoint(
      Offset(16.869999999999997, 5.279999999999999),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: false,
      clockwise: false,
    );
    path_0.arcToPoint(
      Offset(17.609999999999996, 13.389999999999999),
      radius: Radius.elliptical(8.33, 8.33),
      rotation: 0,
      largeArc: false,
      clockwise: true,
    );
    path_0.arcToPoint(
      Offset(19.129999999999995, 14.069999999999999),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: true,
      clockwise: false,
    );
    path_0.arcToPoint(
      Offset(18.239999999999995, 4.339999999999998),
      radius: Radius.elliptical(10, 10),
      rotation: 0,
      largeArc: false,
      clockwise: false,
    );
    path_0.close();

    Paint paint0Fill = Paint()..style = PaintingStyle.fill;
    paint0Fill.color = color;
    canvas.drawPath(path_0, paint0Fill);

    Path path_1 = Path();
    path_1.moveTo(8.82, 11.18);
    path_1.arcToPoint(
      Offset(7.640000000000001, 12.36),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: false,
      clockwise: false,
    );
    path_1.arcToPoint(
      Offset(12.36, 12.36),
      radius: Radius.elliptical(3.33, 3.33),
      rotation: 0,
      largeArc: false,
      clockwise: false,
    );
    path_1.arcToPoint(
      Offset(11.18, 11.18),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: false,
      clockwise: false,
    );
    path_1.arcToPoint(
      Offset(8.82, 11.18),
      radius: Radius.elliptical(1.67, 1.67),
      rotation: 0,
      largeArc: false,
      clockwise: true,
    );
    path_1.close();

    Paint paint1Fill = Paint()..style = PaintingStyle.fill;
    paint1Fill.color = color;
    canvas.drawPath(path_1, paint1Fill);

    Path path_2 = Path();
    path_2.moveTo(15.42, 7.69);
    path_2.cubicTo(15.86, 7.57, 16.32, 7.83, 16.44, 8.27);
    path_2.arcToPoint(
      Offset(8.270000000000001, 16.439999999999998),
      radius: Radius.elliptical(6.67, 6.67),
      rotation: 0,
      largeArc: false,
      clockwise: true,
    );
    path_2.arcToPoint(
      Offset(8.71, 14.829999999999998),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: false,
      clockwise: true,
    );
    path_2.arcToPoint(
      Offset(14.830000000000002, 8.709999999999997),
      radius: Radius.elliptical(5, 5),
      rotation: 0,
      largeArc: false,
      clockwise: false,
    );
    path_2.arcToPoint(
      Offset(15.420000000000002, 7.689999999999998),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: false,
      clockwise: true,
    );
    path_2.close();
    path_2.moveTo(8.82, 7.64);
    path_2.arcToPoint(
      Offset(7.640000000000001, 7.64),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: true,
      clockwise: true,
    );
    path_2.arcToPoint(
      Offset(8.82, 7.64),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: false,
      clockwise: true,
    );
    path_2.close();
    path_2.moveTo(12.36, 7.64);
    path_2.arcToPoint(
      Offset(11.18, 8.82),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: true,
      clockwise: false,
    );
    path_2.arcToPoint(
      Offset(12.36, 7.65),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: false,
      clockwise: false,
    );
    path_2.close();
    path_2.moveTo(17.07, 15.9);
    path_2.cubicTo(17.4, 16.22, 17.4, 16.75, 17.07, 17.07);
    path_2.lineTo(17.07, 17.080000000000002);
    path_2.arcToPoint(
      Offset(15.89, 15.900000000000002),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: false,
      clockwise: true,
    );
    path_2.arcToPoint(
      Offset(17.07, 15.900000000000002),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: false,
      clockwise: true,
    );
    path_2.close();

    Paint paint2Fill = Paint()..style = PaintingStyle.fill;
    paint2Fill.color = color;
    canvas.drawPath(path_2, paint2Fill);

    Path path_3 = Path();
    path_3.moveTo(1.45, 6.6);
    path_3.cubicTo(1.89, 6.72, 2.15, 7.1899999999999995, 2.01, 7.63);
    path_3.arcToPoint(
      Offset(13.379999999999999, 17.62),
      radius: Radius.elliptical(8.33, 8.33),
      rotation: 0,
      largeArc: false,
      clockwise: false,
    );
    path_3.arcToPoint(
      Offset(14.059999999999999, 19.14),
      radius: Radius.elliptical(0.83, 0.83),
      rotation: 0,
      largeArc: false,
      clockwise: true,
    );
    path_3.arcToPoint(
      Offset(0.4, 7.15),
      radius: Radius.elliptical(10, 10),
      rotation: 0,
      largeArc: false,
      clockwise: true,
    );
    path_3.cubicTo(0.53, 6.71, 1, 6.460000000000001, 1.44, 6.59);
    path_3.close();

    Paint paint3Fill = Paint()..style = PaintingStyle.fill;
    paint3Fill.color = color;
    canvas.drawPath(path_3, paint3Fill);
  }

  @override
  bool shouldRepaint(covariant KRDPASSLogoPainter oldDelegate) {
    return oldDelegate.color != color;
  }
}
